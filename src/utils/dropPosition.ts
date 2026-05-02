import type React from "react";
import type { Direction, EdgeDirection, EdgePreview } from "../types/layout";

export function getDropDirection(rect: DOMRect, x: number, y: number): Direction {
    const localX = x - rect.left;
    const localY = y - rect.top;

    const leftRatio = localX / rect.width;
    const topRatio = localY / rect.height;

    if (leftRatio < 0.28) return "left";
    if (leftRatio > 0.72) return "right";
    if (topRatio < 0.28) return "top";
    if (topRatio > 0.72) return "bottom";

    return "center";
}

export function getTargetEdgePreview(
    clientX: number,
    clientY: number,
    sourceWindowId: string | "main" | null
): EdgePreview {
    const workspace = document.querySelector<HTMLElement>(".workspace");
    if (!workspace) return null;

    const workspaceRect = workspace.getBoundingClientRect();
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-dock-id]"));
    const edgeZone = 80;

    let best:
        | {
              targetWindowId: string | "main";
              direction: EdgeDirection;
              rect: React.CSSProperties;
              score: number;
          }
        | null = null;

    for (const target of targets) {
        const targetWindowId = target.dataset.dockId as string | "main";
        if (sourceWindowId && targetWindowId === sourceWindowId) continue;

        const rect = targetWindowId === "main" ? workspaceRect : target.getBoundingClientRect();

        const inside =
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom;

        if (!inside) continue;

        const dTop = clientY - rect.top;
        const dBottom = rect.bottom - clientY;
        const dLeft = clientX - rect.left;
        const dRight = rect.right - clientX;
        const min = Math.min(dTop, dBottom, dLeft, dRight);

        if (min > edgeZone) continue;

        let direction: EdgeDirection;
        if (min === dTop) direction = "top";
        else if (min === dBottom) direction = "bottom";
        else if (min === dLeft) direction = "left";
        else direction = "right";

        const baseLeft = rect.left - workspaceRect.left;
        const baseTop = rect.top - workspaceRect.top;
        let previewRect: React.CSSProperties;

        if (direction === "left") {
            previewRect = { left: baseLeft, top: baseTop, width: rect.width * 0.25, height: rect.height };
        } else if (direction === "right") {
            previewRect = { left: baseLeft + rect.width * 0.75, top: baseTop, width: rect.width * 0.25, height: rect.height };
        } else if (direction === "top") {
            previewRect = { left: baseLeft, top: baseTop, width: rect.width, height: rect.height * 0.25 };
        } else {
            previewRect = { left: baseLeft, top: baseTop + rect.height * 0.75, width: rect.width, height: rect.height * 0.25 };
        }

        if (!best || min < best.score) {
            best = { targetWindowId, direction, rect: previewRect, score: min };
        }
    }

    if (!best) return null;

    return {
        targetWindowId: best.targetWindowId,
        direction: best.direction,
        rect: best.rect,
    };
}
