import { DEFAULT_INSTRUMENT_ID } from "../virtualInstrument/instrumentRegistry";
import type { Chord, TimeSignatureEvent, WmlProject, WmlSection } from "./wmlTypes";

export const WML_TICKS_PER_QUARTER = 480;

export function createId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function wmlToJson(project: WmlProject): string {
    return JSON.stringify(project, null, 2);
}

export function jsonToWml(json: string): WmlProject {
    let data: unknown;

    try {
        data = JSON.parse(json);
    } catch {
        throw new Error("JSON 파싱 실패");
    }

    if (!isWmlProjectLike(data)) {
        throw new Error("유효하지 않은 WML 구조");
    }

    return normalizeWmlProject(data);
}

function isWmlProjectLike(data: any): data is WmlProject {
    return (
        typeof data === "object" &&
        data !== null &&
        typeof data.id === "string" &&
        typeof data.title === "string" &&
        Array.isArray(data.tempos) &&
        Array.isArray(data.timeSignatures) &&
        Array.isArray(data.sections)
    );
}

export function createEmptyChord(): Chord {
    return {
        id: createId("chord"),
        notes: [],
    };
}

export function createEmptySection(index: number): WmlSection {
    return {
        id: createId("section"),
        name: `Section ${index + 1}`,
        instrument: DEFAULT_INSTRUMENT_ID,
        sustain: [],
        chords: [createEmptyChord()],
    };
}

export function renameSection(
    project: WmlProject,
    sectionId: string,
    name: string
): WmlProject {
    const nextName = name.trim();

    if (!nextName) {
        return project;
    }

    return {
        ...project,
        sections: project.sections.map((section) =>
            section.id === sectionId
                ? {
                      ...section,
                      name: nextName,
                  }
                : section
        ),
    };
}

export function normalizeWmlProject(project: any): WmlProject {
    return {
        ...project,
        tempos: Array.isArray(project.tempos) ? project.tempos : [],
        timeSignatures: normalizeTimeSignatures(project.timeSignatures),
        sections: Array.isArray(project.sections)
            ? project.sections.map((section: any, sectionIndex: number): WmlSection => ({
                  id: typeof section.id === "string" ? section.id : createId("section"),
                  name:
                      typeof section.name === "string"
                          ? section.name
                          : `Section ${sectionIndex + 1}`,
                  instrument:
                      typeof section.instrument === "string"
                          ? section.instrument
                          : DEFAULT_INSTRUMENT_ID,
                  sustain: Array.isArray(section.sustain) ? section.sustain : [],
                  chords: Array.isArray(section.chords)
                      ? section.chords.map((chord: any): Chord => {
                            if (Array.isArray(chord)) {
                                return {
                                    id: createId("chord"),
                                    notes: chord,
                                };
                            }

                            return {
                                id: typeof chord?.id === "string" ? chord.id : createId("chord"),
                                notes: Array.isArray(chord?.notes) ? chord.notes : [],
                            };
                        })
                      : [],
              }))
            : [],
    };
}

export function barToTick(
    bar: number,
    timeSignatures: TimeSignatureEvent[],
): number {
    const targetBar = Math.max(0, Math.round(bar));
    const sorted = normalizeTimeSignatures(timeSignatures);

    let currentBar = 0;
    let currentTick = 0;
    let currentNumerator = 4;
    let currentDenominator = 4;

    for (const event of sorted) {
        if (event.bar <= currentBar) {
            currentNumerator = event.numerator;
            currentDenominator = event.denominator;
            continue;
        }

        if (event.bar > targetBar) break;

        currentTick += (event.bar - currentBar) *
            getTicksPerBar(currentNumerator, currentDenominator);
        currentBar = event.bar;
        currentNumerator = event.numerator;
        currentDenominator = event.denominator;
    }

    currentTick += (targetBar - currentBar) *
        getTicksPerBar(currentNumerator, currentDenominator);

    return Math.round(currentTick);
}

export function tickToBar(
    tick: number,
    timeSignatures: unknown,
): number {
    const targetTick = Math.max(0, Math.round(tick));
    const sorted = normalizeTimeSignatures(timeSignatures);

    let currentBar = 0;
    let currentTick = 0;
    let currentNumerator = 4;
    let currentDenominator = 4;

    for (const event of sorted) {
        const eventTick = barToTick(event.bar, sorted);

        if (eventTick > targetTick) break;

        currentTick = eventTick;
        currentBar = event.bar;
        currentNumerator = event.numerator;
        currentDenominator = event.denominator;
    }

    const ticksPerBar = getTicksPerBar(currentNumerator, currentDenominator);

    return Math.max(0, Math.round(currentBar + (targetTick - currentTick) / ticksPerBar));
}

export function createEmptyProject(): WmlProject {
    return {
        id: createId("project"),
        title: "Untitled",
        tempos: [
            {
                id: createId("tempo"),
                tick: 0,
                bpm: 120,
            },
        ],
        timeSignatures: [
            {
                id: createId("timesig"),
                bar: 3,
                numerator: 3,
                denominator: 4,
            },
        ],
        sections: [],
    };
}

function normalizeTimeSignatures(value: unknown): TimeSignatureEvent[] {
    if (!Array.isArray(value)) return [];

    const legacyEvents = value
        .map((event) => normalizeRawTimeSignature(event))
        .filter((event): event is TimeSignatureEvent | LegacyTimeSignatureEvent => event != null);

    return legacyEvents
        .map((event) => {
            if ("bar" in event) return event;

            return {
                id: event.id,
                bar: legacyTickToBar(event.tick, legacyEvents),
                numerator: event.numerator,
                denominator: event.denominator,
            };
        })
        .sort((a, b) => a.bar - b.bar);
}

type LegacyTimeSignatureEvent = {
    id: string;
    tick: number;
    numerator: number;
    denominator: number;
};

function normalizeRawTimeSignature(
    event: unknown,
): TimeSignatureEvent | LegacyTimeSignatureEvent | null {
    if (event == null || typeof event !== "object") return null;

    const obj = event as Record<string, unknown>;
    const numerator = normalizePositiveInteger(obj.numerator, 4);
    const denominator = normalizePositiveInteger(obj.denominator, 4);
    const id = typeof obj.id === "string" ? obj.id : createId("timesig");

    if (typeof obj.bar === "number" && Number.isFinite(obj.bar)) {
        return {
            id,
            bar: Math.max(0, Math.round(obj.bar)),
            numerator,
            denominator,
        };
    }

    if (typeof obj.tick === "number" && Number.isFinite(obj.tick)) {
        return {
            id,
            tick: Math.max(0, Math.round(obj.tick)),
            numerator,
            denominator,
        };
    }

    return {
        id,
        bar: 0,
        numerator,
        denominator,
    };
}

function legacyTickToBar(
    tick: number,
    events: Array<TimeSignatureEvent | LegacyTimeSignatureEvent>,
) {
    const legacyEvents = events
        .filter((event): event is LegacyTimeSignatureEvent => "tick" in event)
        .sort((a, b) => a.tick - b.tick);

    let currentTick = 0;
    let currentBar = 0;
    let currentNumerator = 4;
    let currentDenominator = 4;

    for (const event of legacyEvents) {
        if (event.tick > tick) break;

        const ticksPerBar = getTicksPerBar(currentNumerator, currentDenominator);
        currentBar += Math.max(0, event.tick - currentTick) / ticksPerBar;
        currentTick = event.tick;
        currentNumerator = event.numerator;
        currentDenominator = event.denominator;
    }

    currentBar += Math.max(0, tick - currentTick) /
        getTicksPerBar(currentNumerator, currentDenominator);

    return Math.max(0, Math.round(currentBar));
}

function normalizePositiveInteger(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isInteger(value) && value > 0
        ? value
        : fallback;
}

function getTicksPerBar(numerator: number, denominator: number) {
    return WML_TICKS_PER_QUARTER * 4 * numerator / denominator;
}
