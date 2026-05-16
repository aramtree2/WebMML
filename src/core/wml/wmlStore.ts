import type { WmlProject } from "./wmlTypes";
import { createEmptyProject, normalizeWmlProject } from "./wmlUtils";

let currentProject: WmlProject = createEmptyProject();
const listeners = new Set<(p: WmlProject) => void>();

export function getWmlProject() {
    return currentProject;
}

export function setWmlProject(project: WmlProject, options?: { save?: boolean }) {
    currentProject = normalizeWmlProject(project);

    if (options?.save !== false) {
        saveWmlProject();
    }

    listeners.forEach((l) => l(currentProject));
}

export function updateWmlProject(
    updater: (p: WmlProject) => WmlProject,
    options?: { save?: boolean }
) {
    setWmlProject(updater(currentProject), options);
}

export function subscribeWmlProject(
    listener: (project: WmlProject) => void
) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

const STORAGE_KEY = "wml_project";

export function saveWmlProject(project: WmlProject = currentProject) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeWmlProject(project)));
}

export function loadWmlProject(): WmlProject | null {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    try {
        return normalizeWmlProject(JSON.parse(data));
    } catch {
        return null;
    }
}

export function loadOrCreateWmlProject() {
    const loaded = loadWmlProject();

    if (loaded) {
        setWmlProject(loaded, { save: false });
        return loaded;
    }

    const created = createEmptyProject();
    setWmlProject(created);
    return created;
}
