export type PianoRollNoteView = {
    id: string;
    midi: number;
    startTick: number;
    durationTick: number;
    velocity?: number;
    source: unknown;
};

export type PianoRollData = {
    notes: PianoRollNoteView[];
    ticksPerBeat: number;
    beatCount: number;
};

const DEFAULT_TICKS_PER_BEAT = 480;
const DEFAULT_BEAT_COUNT = 32;

export function wmlProjectToPianoRollData(project: unknown): PianoRollData {
    const ticksPerBeat = getTicksPerBeat(project);
    const notes = collectNoteViews(project);
    const lastTick = notes.reduce(
        (max, note) => Math.max(max, note.startTick + note.durationTick),
        0,
    );

    return {
        notes,
        ticksPerBeat,
        beatCount: Math.max(DEFAULT_BEAT_COUNT, Math.ceil(lastTick / ticksPerBeat) + 4),
    };
}

function collectNoteViews(project: unknown): PianoRollNoteView[] {
    const result: PianoRollNoteView[] = [];
    const visited = new Set<object>();

    const walk = (value: unknown) => {
        if (value == null || typeof value !== "object") return;
        if (visited.has(value)) return;
        visited.add(value);

        const note = toPianoRollNoteView(value);
        if (note != null) {
            result.push(note);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }

        Object.values(value as Record<string, unknown>).forEach(walk);
    };

    walk(project);

    return result.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
}

function toPianoRollNoteView(value: object): PianoRollNoteView | null {
    const obj = value as Record<string, unknown>;

    if (!looksLikeNoteEvent(obj)) return null;

    const midi = readNumber(obj, ["midi", "note", "pitch", "key"]);
    const startTick = readNumber(obj, ["startTick", "tick", "timeTick", "start", "time", "position"]);
    const durationTick = readNumber(obj, ["durationTick", "duration", "lengthTick", "length", "gateTick", "gate"]);

    if (midi == null || startTick == null || durationTick == null) return null;
    if (midi < 0 || midi > 127 || durationTick <= 0) return null;

    const id = readString(obj, ["id", "noteId", "eventId"]) ?? makeFallbackId(midi, startTick, durationTick);
    const velocity = readNumber(obj, ["velocity", "volume", "vel"]);

    return {
        id,
        midi,
        startTick,
        durationTick,
        velocity: velocity ?? undefined,
        source: value,
    };
}

function looksLikeNoteEvent(obj: Record<string, unknown>) {
    const eventType = readString(obj, ["type", "kind", "eventType"]);
    const hasNoteType = eventType == null || eventType.toLowerCase() === "note";
    const hasPitch = readNumber(obj, ["midi", "note", "pitch", "key"]) != null;
    const hasDuration = readNumber(obj, ["durationTick", "duration", "lengthTick", "length", "gateTick", "gate"]) != null;

    return hasNoteType && hasPitch && hasDuration;
}

function getTicksPerBeat(project: unknown) {
    if (project == null || typeof project !== "object") return DEFAULT_TICKS_PER_BEAT;

    const direct = readNumber(project as Record<string, unknown>, [
        "ticksPerBeat",
        "tickPerBeat",
        "ppq",
        "resolution",
    ]);

    return direct != null && direct > 0 ? direct : DEFAULT_TICKS_PER_BEAT;
}

function readNumber(obj: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string" && value.trim() !== "") {
            const numberValue = Number(value);
            if (Number.isFinite(numberValue)) return numberValue;
        }
    }

    return null;
}

function readString(obj: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === "string" && value.trim() !== "") return value;
    }

    return null;
}

function makeFallbackId(midi: number, startTick: number, durationTick: number) {
    return `note-${midi}-${startTick}-${durationTick}`;
}
