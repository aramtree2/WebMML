import type {
    WmlProject,
    WmlSection,
    NoteEvent,
    TempoEvent,
} from "../wml/wmlTypes";

const TPQN = 480;

type MmlEvent =
    | { type: "tempo"; tick: number; bpm: number }
    | { type: "sustain"; tick: number; value: number }
    | { type: "note"; tick: number; note: NoteEvent };

function getDurationMML(tick: number): string {
    const candidates: { duration: number; text: string }[] = [];

    for (const len of [1, 2, 4, 8, 16, 32, 64]) {
        const base = (TPQN * 4) / len;

        candidates.push({ duration: Math.round(base), text: String(len) });
        candidates.push({ duration: Math.round(base * 1.5), text: `${len}.` });
        candidates.push({ duration: Math.round(base * 1.75), text: `${len}..` });
    }

    candidates.sort(
        (a, b) => Math.abs(a.duration - tick) - Math.abs(b.duration - tick)
    );

    return candidates[0]?.text ?? "4";
}

function pitchToNote(pitch: number): { note: string; octave: number } {
    const names = [
        "C",
        "C+",
        "D",
        "D+",
        "E",
        "F",
        "F+",
        "G",
        "G+",
        "A",
        "A+",
        "B",
    ];

    return {
        note: names[((pitch % 12) + 12) % 12],
        octave: Math.floor(pitch / 12) - 1,
    };
}

function addRestIfNeeded(
    result: string[],
    currentTick: number,
    targetTick: number
): number {
    if (targetTick <= currentTick) return currentTick;

    result.push("R" + getDurationMML(targetTick - currentTick));
    return targetTick;
}

function sectionToMML(section: WmlSection, tempoEvents: TempoEvent[]): string {
    const notes: NoteEvent[] = section.chords.flatMap((chord) => chord);

    const events: MmlEvent[] = [];

    for (const tempo of tempoEvents) {
        events.push({
            type: "tempo",
            tick: tempo.tick,
            bpm: tempo.bpm,
        });
    }

    for (const sustain of section.sustain) {
        events.push({
            type: "sustain",
            tick: sustain.tick,
            value: sustain.value,
        });
    }

    for (const note of notes) {
        events.push({
            type: "note",
            tick: note.tick,
            note,
        });
    }

    events.sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;

        const order: Record<MmlEvent["type"], number> = {
            tempo: 0,
            sustain: 1,
            note: 2,
        };

        if (order[a.type] !== order[b.type]) {
            return order[a.type] - order[b.type];
        }

        if (a.type === "note" && b.type === "note") {
            return a.note.pitch - b.note.pitch;
        }

        return 0;
    });

    const result: string[] = [];

    let currentTick = 0;
    let currentOctave = 4;
    let currentVelocity = 8;

    for (const event of events) {
        currentTick = addRestIfNeeded(result, currentTick, event.tick);

        if (event.type === "tempo") {
            result.push("T" + event.bpm);
            continue;
        }

        if (event.type === "sustain") {
            result.push("S" + event.value);
            continue;
        }

        const { note, octave } = pitchToNote(event.note.pitch);

        if (octave !== currentOctave) {
            result.push("O" + octave);
            currentOctave = octave;
        }

        if (event.note.velocity !== currentVelocity) {
            result.push("V" + event.note.velocity);
            currentVelocity = event.note.velocity;
        }

        result.push(note + getDurationMML(event.note.duration));

        currentTick = Math.max(
            currentTick,
            event.note.tick + event.note.duration
        );
    }

    return result.join("");
}

export function wmlToMml(input: WmlProject | string): string {
    const wml: WmlProject =
        typeof input === "string" ? (JSON.parse(input) as WmlProject) : input;

    const tempos = wml.tempos ?? [];
    const sections = wml.sections ?? [];

    const mmlSections = sections.map((section) => sectionToMML(section, tempos));

    return "MML@" + mmlSections.join(",") + ";";
}

export function wmlFileToMmlText(wmlJsonText: string): string {
    const wml = JSON.parse(wmlJsonText) as WmlProject;
    return wmlToMml(wml);
}