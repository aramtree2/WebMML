import type { WmlProject, WmlSection, Chord, NoteEvent } from "./wmlTypes";

// --- id 생성 ---
export function createId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- JSON 변환 ---
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

    if (!isWmlProject(data)) {
        throw new Error("유효하지 않은 WML 구조");
    }

    return data;
}

// --- 검증 ---
function isWmlProject(data: any): data is WmlProject {
    return (
        typeof data === "object" &&
        data !== null &&
        typeof data.id === "string" &&
        typeof data.title === "string" &&
        typeof data.bpm === "number" &&
        Array.isArray(data.tempos) &&
        Array.isArray(data.timeSignatures) &&
        Array.isArray(data.sections)
    );
}

// --- 기본 생성 ---
export function createEmptyProject(): WmlProject {
    return {
        id: createId("project"),
        title: "Untitled",
        tempos: [],
        timeSignatures: [],
        sections: [],
    };
}