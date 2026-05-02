import type { EditorLayoutState } from "../types/layout";

const STORAGE_KEY = "web-mml.editor-layout.v1";

export function loadLayoutState(): EditorLayoutState | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as EditorLayoutState;
        if (!parsed.mainLayout || !Array.isArray(parsed.floating)) return null;

        return parsed;
    } catch {
        return null;
    }
}

export function saveLayoutState(state: EditorLayoutState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // 저장 실패는 앱 실행을 막으면 안 되므로 무시한다.
    }
}

export function clearLayoutState(): void {
    localStorage.removeItem(STORAGE_KEY);
}
