import type { Direction, EdgeDirection, LayoutNode } from "../types/layout";

export function cloneNode(node: LayoutNode): LayoutNode {
    return structuredClone(node);
}

export function countPanels(node: LayoutNode): number {
    if (node.type === "tabs") return node.ids.length;
    return node.children.reduce((sum, child) => sum + countPanels(child), 0);
}

export function containsPanel(node: LayoutNode, id: string): boolean {
    if (node.type === "tabs") return node.ids.includes(id);
    return node.children.some((child) => containsPanel(child, id));
}

export function setActivePanel(node: LayoutNode, panelId: string): LayoutNode {
    if (node.type === "tabs") {
        if (!node.ids.includes(panelId)) return node;
        return { ...node, activeId: panelId };
    }

    return {
        ...node,
        children: node.children.map((child) =>
            containsPanel(child, panelId) ? setActivePanel(child, panelId) : child
        ),
    };
}

export function removePanel(node: LayoutNode, panelId: string): LayoutNode | null {
    if (node.type === "tabs") {
        const ids = node.ids.filter((id) => id !== panelId);
        if (ids.length === 0) return null;

        return {
            type: "tabs",
            ids,
            activeId: ids.includes(node.activeId) ? node.activeId : ids[0],
        };
    }

    const nextChildren: LayoutNode[] = [];
    const nextSizes: number[] = [];

    node.children.forEach((child, index) => {
        const next = removePanel(child, panelId);

        if (next) {
            nextChildren.push(next);

            if (node.sizes?.[index] != null) {
                nextSizes.push(node.sizes[index]);
            }
        }
    });

    if (nextChildren.length === 0) return null;
    if (nextChildren.length === 1) return nextChildren[0];

    const total = nextSizes.reduce((a, b) => a + b, 0);

    return {
        ...node,
        children: nextChildren,
        sizes:
            nextSizes.length === nextChildren.length && total > 0
                ? nextSizes.map((size) => (size / total) * 100)
                : undefined,
    };
}

export function insertPanel(
    node: LayoutNode,
    targetId: string,
    panelId: string,
    direction: Direction
): LayoutNode {
    if (node.type === "tabs") {
        if (!node.ids.includes(targetId)) return node;

        if (direction === "center") {
            if (node.ids.includes(panelId)) return node;

            return {
                type: "tabs",
                ids: [...node.ids, panelId],
                activeId: panelId,
            };
        }

        const newPanel: LayoutNode = {
            type: "tabs",
            ids: [panelId],
            activeId: panelId,
        };

        const axis = direction === "left" || direction === "right" ? "row" : "column";
        const movingFirst = direction === "left" || direction === "top";

        return {
            type: "split",
            direction: axis,
            children: movingFirst ? [newPanel, node] : [node, newPanel],
            sizes: [50, 50],
        };
    }

    return {
        ...node,
        children: node.children.map((child) =>
            containsPanel(child, targetId)
                ? insertPanel(child, targetId, panelId, direction)
                : child
        ),
    };
}

export function splitPanelBySelf(
    node: LayoutNode,
    panelId: string,
    direction: Direction
): LayoutNode {
    if (direction === "center") return node;

    if (node.type === "tabs") {
        if (!node.ids.includes(panelId)) return node;

        const restIds = node.ids.filter((id) => id !== panelId);
        if (restIds.length === 0) return node;

        const movingPanel: LayoutNode = {
            type: "tabs",
            ids: [panelId],
            activeId: panelId,
        };

        const restPanel: LayoutNode = {
            type: "tabs",
            ids: restIds,
            activeId: restIds.includes(node.activeId) ? node.activeId : restIds[0],
        };

        const axis = direction === "left" || direction === "right" ? "row" : "column";
        const movingFirst = direction === "left" || direction === "top";

        return {
            type: "split",
            direction: axis,
            children: movingFirst ? [movingPanel, restPanel] : [restPanel, movingPanel],
            sizes: [50, 50],
        };
    }

    return {
        ...node,
        children: node.children.map((child) =>
            containsPanel(child, panelId)
                ? splitPanelBySelf(child, panelId, direction)
                : child
        ),
    };
}

export function wrapLayoutByEdge(
    base: LayoutNode,
    incoming: LayoutNode,
    direction: EdgeDirection
): LayoutNode {
    if (direction === "left") {
        return { type: "split", direction: "row", children: [incoming, base], sizes: [25, 75] };
    }

    if (direction === "right") {
        return { type: "split", direction: "row", children: [base, incoming], sizes: [75, 25] };
    }

    if (direction === "top") {
        return { type: "split", direction: "column", children: [incoming, base], sizes: [25, 75] };
    }

    return { type: "split", direction: "column", children: [base, incoming], sizes: [75, 25] };
}

export function resizeSplitAtPath(
    node: LayoutNode,
    path: number[],
    splitterIndex: number,
    deltaPercent: number,
    startSizes: number[]
): LayoutNode {
    if (node.type !== "split") return node;

    if (path.length === 0) {
        const next = [...startSizes];
        const min = 8;

        const left = startSizes[splitterIndex];
        const right = startSizes[splitterIndex + 1];

        let newLeft = left + deltaPercent;
        let newRight = right - deltaPercent;

        if (newLeft < min) {
            newLeft = min;
            newRight = left + right - min;
        }

        if (newRight < min) {
            newRight = min;
            newLeft = left + right - min;
        }

        next[splitterIndex] = newLeft;
        next[splitterIndex + 1] = newRight;

        return { ...node, sizes: next };
    }

    const [head, ...rest] = path;

    return {
        ...node,
        children: node.children.map((child, index) =>
            index === head
                ? resizeSplitAtPath(child, rest, splitterIndex, deltaPercent, startSizes)
                : child
        ),
    };
}
