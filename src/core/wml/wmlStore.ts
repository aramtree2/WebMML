import type { WmlProject } from "./wmlTypes";
import { createEmptyProject } from "./wmlUtils";

let currentProject: WmlProject = createEmptyProject();
const listeners = new Set<(p: WmlProject) => void>();

// --- get ---
export function getWmlProject() {
    return currentProject;
}

// --- set ---
export function setWmlProject(project: WmlProject, options?: { save?: boolean }) {
    currentProject = project;

    if (options?.save !== false) {
        saveWmlProject();
    }

    listeners.forEach((l) => l(currentProject));
}

// --- update ---
export function updateWmlProject(
    updater: (p: WmlProject) => WmlProject,
    options?: { save?: boolean }
) {
    setWmlProject(updater(currentProject), options);
}

// --- subscribe ---
export function subscribeWmlProject(listener: (p: WmlProject) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// --- storage ---
const STORAGE_KEY = "wml_project";

export function saveWmlProject(project: WmlProject = currentProject) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadWmlProject(): WmlProject | null {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

// --- init ---
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