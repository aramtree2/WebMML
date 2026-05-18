import type { WmlProject } from "./wmlTypes";
import { getWmlProject } from "./wmlStore";
import { normalizeWmlProject } from "./wmlUtils";

function getSafeFileName(filename: string) {
    return filename.replace(/[\\/:*?"<>|]/g, "_");
}

export function saveWmlProjectToFile(project: WmlProject = getWmlProject()) {
    const normalized = normalizeWmlProject(project);

    const json = JSON.stringify(normalized, null, 2);

    const blob = new Blob([json], {
        type: "application/json;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    const title = normalized.title?.trim() || "wml_project";
    a.href = url;
    a.download = `${getSafeFileName(title)}.wml.json`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}