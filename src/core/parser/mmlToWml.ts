import type {
    WmlProject,
    WmlSection,
    Chord,
    TempoEvent,
    SustainEvent,
} from "../wml/wmlTypes";

import { createId } from "../wml/wmlUtils";

const TPQN = 480;

export class MMLParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MMLParseError";
    }
}

const MML_LIMITS = {
    T: { min: 32, max: 255 },
    O: { min: 0, max: 8 },
    N: { min: 0, max: 127 },
    V: { min: 0, max: 15 },
    L: { min: 1, max: 64 },
    S: { min: 0, max: 1 },
} as const;

type MmlCommand = keyof typeof MML_LIMITS;

type ParsedNote = {
    pitch: number;
    tick: number;
    duration: number;
    velocity: number;
};

type ParsedTempo = {
    tick: number;
    bpm: number;
};

type ParsedSustain = {
    tick: number;
    value: number;
};

type RawTrack = {
    mml: string;
    instrument: number;
};

type TrackInfo = {
    index: number;
    defaultInstrument: number;
};

type ParsedMMLPart = {
    chords: ParsedNote[];
    tempoEvents: ParsedTempo[];
    sustainEvents: ParsedSustain[];
};

type MS2Data = {
    sustainMML: string;
    chordTracks: RawTrack[];
};

type MmlToWmlOptions = {
    title?: string;
    instrumentOverrides?: number[] | null;
    numerator?: number;
    denominator?: number;
};

const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

function clampCommandValue(command: MmlCommand, value: number): number {
    const range = MML_LIMITS[command];
    return clamp(value, range.min, range.max);
}

function cleanMML(mml: string): string {
    return mml.replace(/;+\s*$/g, "").trim();
}

function extractMMITracks(content: string): RawTrack[] {
    const regex =
        /mml-track\s*=\s*MML@([\s\S]*?)(?=\n\s*(?:name|program|songProgram|panpot|visible|mml-track)\s*=|$)/gi;

    const tracks: RawTrack[] = [];
    let m: RegExpExecArray | null;

    while ((m = regex.exec(content)) !== null) {
        const sections = cleanMML(m[1])
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        for (const section of sections) {
            tracks.push({
                mml: section,
                instrument: 1,
            });
        }
    }

    return tracks;
}

function extractTextTracks(content: string): RawTrack[] {
    let mml = content.trim().replace(/^\uFEFF/, "");
    mml = mml.replace(/^MML@\s*/i, "");
    mml = cleanMML(mml);

    if (!mml) return [];

    return mml
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((section) => ({
            mml: section,
            instrument: 1,
        }));
}

function extractMS2Data(content: string): MS2Data {
    const melodyMatch = content.match(
        /<melody>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/melody>/i
    );

    const chordRegex =
        /<chord[^>]*index\s*=\s*"(\d+)"[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/chord>/gi;

    const sustainMML = melodyMatch ? cleanMML(melodyMatch[1]) : "";
    const chordTracks: RawTrack[] = [];
    let m: RegExpExecArray | null;

    while ((m = chordRegex.exec(content)) !== null) {
        chordTracks.push({
            mml: cleanMML(m[2]),
            instrument: 1,
        });
    }

    return { sustainMML, chordTracks };
}

function extractTracks(content: string): RawTrack[] {
    const mmiTracks = extractMMITracks(content);
    return mmiTracks.length ? mmiTracks : extractTextTracks(content);
}

export function extractTracksInfo(content: string): TrackInfo[] {
    if (/<ms2>/i.test(content)) {
        const { sustainMML } = extractMS2Data(content);
        if (!sustainMML) return [];

        const parsed = parseSingleMMLPart(sustainMML);
        const sustains = normalizeSustainEvents(parsed.sustainEvents);

        return sustains.map((_, i) => ({
            index: i,
            defaultInstrument: 1,
        }));
    }

    return extractTracks(content).map((_, i) => ({
        index: i,
        defaultInstrument: 1,
    }));
}

function normalizeMMLInput(mml: string): string {
    return mml.replace(/\s+/g, "").trim();
}

function tokenizeMML(mml: string): string[] {
    const tokenRegex =
        /[A-GR][#\+\-]?[0-9]*(?:\.+)?|N[0-9]+|V[0-9]+|T[0-9]+|O[0-9]+|L[0-9]+(?:\.+)?|S[0-9]+|&|[<>]/gi;

    const tokens: string[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = tokenRegex.exec(mml)) !== null) {
        const skipped = mml.slice(lastIndex, m.index);

        if (skipped.replace(/\s+/g, "")) {
            throw new MMLParseError(`Invalid MML token(s): ${skipped}`);
        }

        tokens.push(m[0].toUpperCase());
        lastIndex = tokenRegex.lastIndex;
    }

    const tail = mml.slice(lastIndex);

    if (tail.replace(/\s+/g, "")) {
        throw new MMLParseError(`Invalid MML token(s): ${tail}`);
    }

    return tokens;
}

function getNoteNumber(note: string, octave: number): number {
    const table: Record<string, number> = {
        C: 0,
        D: 2,
        E: 4,
        F: 5,
        G: 7,
        A: 9,
        B: 11,
    };

    return 12 * (octave + 1) + table[note];
}

function getDuration(len: number, dots: number): number {
    let mul = 1;
    let add = 0.5;

    for (let i = 0; i < dots; i++) {
        mul += add;
        add /= 2;
    }

    return Math.round(((TPQN * 4) / len) * mul);
}

function parseSingleMMLPart(mml: string): ParsedMMLPart {
    let octave = 4;
    let defaultLen = 4;
    let defaultDots = 0;
    let time = 0;
    let velocity = 8;

    const chords: ParsedNote[] = [];
    const tempoEvents: ParsedTempo[] = [];
    const sustainEvents: ParsedSustain[] = [];

    let lastNote: ParsedNote | null = null;
    let tie = false;

    for (const token of tokenizeMML(normalizeMMLInput(mml))) {
        const head = token[0];

        if (token === "&") {
            if (!lastNote) throw new MMLParseError("Tie error");
            tie = true;
            continue;
        }

        if (tie && ("RTVOLS".includes(head) || token === ">" || token === "<")) {
            throw new MMLParseError(`Invalid tie target: ${token}`);
        }

        if (head === "T") {
            const bpm = clampCommandValue("T", Number(token.slice(1)));
            tempoEvents.push({ tick: time, bpm });
            continue;
        }

        if (head === "V") {
            velocity = clampCommandValue("V", Number(token.slice(1)));
            continue;
        }

        if (head === "O") {
            octave = clampCommandValue("O", Number(token.slice(1)));
            continue;
        }

        if (head === "L") {
            defaultLen = clampCommandValue("L", Number(token.slice(1)));
            defaultDots = (token.match(/\./g) || []).length;
            continue;
        }

        if (head === "S") {
            const sValue = Number(token.slice(1));

            if (sValue !== 0 && sValue !== 1) {
                throw new MMLParseError(`Invalid sustain value: ${token}`);
            }

            sustainEvents.push({
                tick: time,
                value: sValue,
            });
            continue;
        }

        if (token === ">") {
            octave = clampCommandValue("O", octave + 1);
            continue;
        }

        if (token === "<") {
            octave = clampCommandValue("O", octave - 1);
            continue;
        }

        const lenMatch = token.match(/[0-9]+/);
        const len = clampCommandValue(
            "L",
            lenMatch ? Number(lenMatch[0]) : defaultLen
        );

        let dots = (token.match(/\./g) || []).length;
        if (!lenMatch) dots = defaultDots;

        const duration = getDuration(len, dots);

        if (head === "R") {
            time += duration;
            lastNote = null;
            tie = false;
            continue;
        }

        let pitch =
            head === "N"
                ? clampCommandValue("N", Number(token.slice(1)))
                : getNoteNumber(head, octave) +
                (token.includes("+") || token.includes("#") ? 1 : 0) -
                (token.includes("-") ? 1 : 0);

        pitch = clamp(pitch, 0, 127);

        if (tie) {
            if (!lastNote) throw new MMLParseError("Invalid tie");
            if (lastNote.pitch !== pitch) {
                throw new MMLParseError("Tie mismatch");
            }

            lastNote.duration += duration;
        } else {
            lastNote = {
                pitch,
                tick: time,
                duration,
                velocity,
            };

            chords.push(lastNote);
        }

        time += duration;
        tie = false;
    }

    if (tie) {
        throw new MMLParseError("Tie error: dangling '&' at end of MML");
    }

    return { chords, tempoEvents, sustainEvents };
}

function normalizeSustainEvents(events: ParsedSustain[]): ParsedSustain[] {
    const sustains = [...events].sort((a, b) => a.tick - b.tick);
    const normalized: ParsedSustain[] = [];

    if (!sustains.length || sustains[0].tick !== 0) {
        normalized.push({ tick: 0, value: 0 });
    }

    for (const e of sustains) {
        const last = normalized[normalized.length - 1];

        if (!last || last.tick !== e.tick || last.value !== e.value) {
            normalized.push({
                tick: e.tick,
                value: e.value,
            });
        }
    }

    return normalized;
}

function toTempoEvent(e: ParsedTempo): TempoEvent {
    return {
        id: createId("tempo"),
        tick: e.tick,
        bpm: e.bpm,
    };
}

function toSustainEvent(e: ParsedSustain): SustainEvent {
    return {
        id: createId("sustain"),
        tick: e.tick,
        value: e.value,
    };
}

function notesToChords(notes: ParsedNote[]): Chord[] {
    const chordMap = new Map<number, Chord>();

    const sortedNotes = [...notes].sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;
        return a.pitch - b.pitch;
    });

    for (const note of sortedNotes) {
        if (!chordMap.has(note.tick)) {
            chordMap.set(note.tick, []);
        }

        chordMap.get(note.tick)!.push({
            id: createId("note"),
            pitch: note.pitch,
            tick: note.tick,
            duration: note.duration,
            velocity: note.velocity,
        });
    }

    return [...chordMap.values()];
}

function dedupeTempos(tempos: TempoEvent[]): TempoEvent[] {
    const map = new Map<string, TempoEvent>();

    for (const tempo of tempos) {
        const key = `${tempo.tick}-${tempo.bpm}`;

        if (!map.has(key)) {
            map.set(key, tempo);
        }
    }

    return [...map.values()].sort((a, b) => a.tick - b.tick);
}

function mergeSustainEvents(events: SustainEvent[]): SustainEvent[] {
    if (!events.length) {
        return [{ id: createId("sustain"), tick: 0, value: 0 }];
    }

    const sorted = [...events].sort((a, b) => a.tick - b.tick);
    const result: SustainEvent[] = [];

    for (const event of sorted) {
        const last = result[result.length - 1];

        if (!last || last.tick !== event.tick || last.value !== event.value) {
            result.push(event);
        }
    }

    if (result[0].tick !== 0) {
        result.unshift({ id: createId("sustain"), tick: 0, value: 0 });
    }

    return result;
}

function normalizeTimeSignature(numerator: number, denominator: number) {
    let n = Number(numerator);
    let d = Number(denominator);

    if (!Number.isInteger(n) || n <= 0) n = 4;
    if (!Number.isInteger(d) || d <= 0) d = 4;

    return { numerator: n, denominator: d };
}

function convertMS2ContentToWML(
    content: string,
    options: MmlToWmlOptions = {}
): WmlProject {
    const { sustainMML, chordTracks } = extractMS2Data(content);

    if (!sustainMML && !chordTracks.length) {
        throw new Error("No tracks found");
    }

    const { numerator, denominator } = normalizeTimeSignature(
        options.numerator ?? 4,
        options.denominator ?? 4
    );

    const tempos: TempoEvent[] = [];

    const sustainParsed = sustainMML
        ? parseSingleMMLPart(sustainMML)
        : { sustainEvents: [], tempoEvents: [], chords: [] };

    const sustainEvents = normalizeSustainEvents(sustainParsed.sustainEvents);
    tempos.push(...sustainParsed.tempoEvents.map(toTempoEvent));

    const allNotes: ParsedNote[] = [];

    chordTracks.forEach((t) => {
        const parsed = parseSingleMMLPart(t.mml);
        tempos.push(...parsed.tempoEvents.map(toTempoEvent));
        allNotes.push(...parsed.chords);
    });

    const sections: WmlSection[] = [];

    for (let i = 0; i < sustainEvents.length; i++) {
        const start = sustainEvents[i].tick;
        const end =
            i + 1 < sustainEvents.length ? sustainEvents[i + 1].tick : Infinity;

        const sectionNotes = allNotes.filter(
            (note) => note.tick >= start && note.tick < end
        );

        if (sectionNotes.length === 0) continue;

        sections.push({
            id: createId("section"),
            name: `Sustain Section ${i + 1}`,
            instrument: 1,
            sustain: [
                {
                    id: createId("sustain"),
                    tick: start,
                    value: sustainEvents[i].value,
                },
            ],
            chords: notesToChords(sectionNotes),
        });
    }

    if (!sections.length) {
        sections.push({
            id: createId("section"),
            name: "Instrument 1",
            instrument: 1,
            sustain: [{ id: createId("sustain"), tick: 0, value: 0 }],
            chords: notesToChords(allNotes),
        });
    }

    if (!tempos.length) {
        tempos.push({
            id: createId("tempo"),
            tick: 0,
            bpm: 120,
        });
    }

    return {
        id: createId("project"),
        title: options.title ?? "Imported MML",
        timeSignatures: [
            {
                id: createId("timesig"),
                tick: 0,
                numerator,
                denominator,
            },
        ],
        tempos: dedupeTempos(tempos),
        sections,
    };
}

export function mmlToWml(
    content: string,
    options: MmlToWmlOptions = {}
): WmlProject {
    if (/<ms2>/i.test(content)) {
        return convertMS2ContentToWML(content, options);
    }

    const tracks = extractTracks(content);

    if (!tracks.length) {
        throw new Error("No tracks found");
    }

    const { numerator, denominator } = normalizeTimeSignature(
        options.numerator ?? 4,
        options.denominator ?? 4
    );

    const tempos: TempoEvent[] = [];
    const sections: WmlSection[] = [];

    tracks.forEach((t, i) => {
        const instrument =
            Array.isArray(options.instrumentOverrides) &&
                options.instrumentOverrides[i] != null
                ? Number(options.instrumentOverrides[i])
                : t.instrument ?? 1;

        const parsed = parseSingleMMLPart(t.mml);

        tempos.push(...parsed.tempoEvents.map(toTempoEvent));

        const notes = parsed.chords;

        if (notes.length === 0) return;

        sections.push({
            id: createId("section"),
            name: `Instrument ${instrument}`,
            instrument,
            sustain: mergeSustainEvents(
                parsed.sustainEvents.length > 0
                    ? normalizeSustainEvents(parsed.sustainEvents).map(toSustainEvent)
                    : []
            ),
            chords: notesToChords(notes),
        });
    });

    if (!tempos.length) {
        tempos.push({
            id: createId("tempo"),
            tick: 0,
            bpm: 120,
        });
    }

    return {
        id: createId("project"),
        title: options.title ?? "Imported MML",
        timeSignatures: [
            {
                id: createId("timesig"),
                tick: 0,
                numerator,
                denominator,
            },
        ],
        tempos: dedupeTempos(tempos),
        sections,
    };
}