import type { Chord, WmlProject } from "./wmlTypes";

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

export function normalizeWmlProject(project: any): WmlProject {
    return {
        ...project,
        sections: project.sections.map((section: any) => ({
            ...section,
            chords: section.chords.map((chord: any): Chord => {
                if (Array.isArray(chord)) {
                    return {
                        id: createId("chord"),
                        notes: chord,
                    };
                }

                return chord;
            }),
        })),
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