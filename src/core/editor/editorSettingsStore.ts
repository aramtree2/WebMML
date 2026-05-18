export type EditorSettings = {
    mmlMode: boolean;
};

const STORAGE_KEY = "web-mml.editor-settings.v1";

const defaultSettings: EditorSettings = {
    mmlMode: false,
};

let state: EditorSettings = loadEditorSettings();

const listeners = new Set<(settings: EditorSettings) => void>();

function normalizeEditorSettings(value: unknown): EditorSettings {
    if (value == null || typeof value !== "object") {
        return { ...defaultSettings };
    }

    const settings = value as Partial<EditorSettings>;

    return {
        mmlMode:
            typeof settings.mmlMode === "boolean"
                ? settings.mmlMode
                : defaultSettings.mmlMode,
    };
}

function emit() {
    listeners.forEach((listener) => listener(state));
}

export function getEditorSettings() {
    return state;
}

export function subscribeEditorSettings(listener: (settings: EditorSettings) => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function setEditorSettings(settings: EditorSettings) {
    state = normalizeEditorSettings(settings);
    saveEditorSettings(state);
    emit();
}

export function updateEditorSettings(
    updater: (settings: EditorSettings) => EditorSettings
) {
    setEditorSettings(updater(state));
}

export function setMmlMode(enabled: boolean) {
    updateEditorSettings((settings) => ({
        ...settings,
        mmlMode: enabled,
    }));
}

export function loadEditorSettings(): EditorSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...defaultSettings };

        return normalizeEditorSettings(JSON.parse(raw));
    } catch {
        return { ...defaultSettings };
    }
}

export function saveEditorSettings(settings: EditorSettings = state) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(normalizeEditorSettings(settings))
        );
    } catch {
        // 설정 저장 실패는 편집기 실행을 막으면 안 되므로 무시한다.
    }
}
