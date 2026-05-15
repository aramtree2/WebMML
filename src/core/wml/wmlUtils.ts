import { DEFAULT_INSTRUMENT_ID } from "../virtualInstrument/instrumentRegistry";
import type { Chord, WmlProject, WmlSection } from "./wmlTypes";

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
        timeSignatures: Array.isArray(project.timeSignatures) ? project.timeSignatures : [],
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

export function createEmptyProject(): WmlProject {
    return {
        id: createId("project"),
        title: "Untitled",
        tempos: [],
        timeSignatures: [],
        sections: [],
    };
}
