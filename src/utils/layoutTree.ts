import type { Direction, DockSnapshot, EdgeDirection, LayoutNode } from "../types/layout";

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

function getNodeAtPath(node: LayoutNode, path: number[]): LayoutNode | null {
    let current: LayoutNode = node;

    for (const index of path) {
        if (current.type !== "split") return null;

        const child = current.children[index];
        if (!child) return null;

        current = child;
    }

    return current;
}

function getFirstPanelId(node: LayoutNode): string | undefined {
    if (node.type === "tabs") {
        return node.ids[0];
    }

    for (const child of node.children) {
        const found = getFirstPanelId(child);
        if (found) return found;
    }

    return undefined;
}

function insertChildAtPath(
    node: LayoutNode,
    path: number[],
    childIndex: number,
    incoming: LayoutNode
): LayoutNode | null {
    if (path.length === 0) {
        if (node.type !== "split") return null;

        const children = [...node.children];
        const insertIndex = Math.min(Math.max(childIndex, 0), children.length);

        children.splice(insertIndex, 0, incoming);

        const sizes = node.sizes
            ? [...node.sizes]
            : Array.from({ length: node.children.length }, () => 100 / node.children.length);

        const insertedSize = sizes[insertIndex] ?? sizes[insertIndex - 1] ?? 100 / (children.length || 1);
        sizes.splice(insertIndex, 0, insertedSize);

        const total = sizes.reduce((sum, size) => sum + size, 0);

        return {
            ...node,
            children,
            sizes: total > 0 ? sizes.map((size) => (size / total) * 100) : undefined,
        };
    }

    if (node.type !== "split") return null;

    const [head, ...rest] = path;
    const targetChild = node.children[head];

    if (!targetChild) return null;

    const restoredChild = insertChildAtPath(targetChild, rest, childIndex, incoming);
    if (!restoredChild) return null;

    return {
        ...node,
        children: node.children.map((child, index) => (index === head ? restoredChild : child)),
    };
}

function insertTabAtPath(
    node: LayoutNode,
    tabPath: number[],
    panelId: string,
    tabIndex: number
): LayoutNode | null {
    if (tabPath.length === 0) {
        if (node.type !== "tabs") return null;
        if (node.ids.includes(panelId)) return node;

        const ids = [...node.ids];
        const insertIndex = Math.min(Math.max(tabIndex, 0), ids.length);

        ids.splice(insertIndex, 0, panelId);

        return {
            type: "tabs",
            ids,
            activeId: panelId,
        };
    }

    if (node.type !== "split") return null;

    const [head, ...rest] = tabPath;
    const targetChild = node.children[head];

    if (!targetChild) return null;

    const restoredChild = insertTabAtPath(targetChild, rest, panelId, tabIndex);
    if (!restoredChild) return null;

    return {
        ...node,
        children: node.children.map((child, index) => (index === head ? restoredChild : child)),
    };
}

export function findPanelSnapshot(node: LayoutNode, panelId: string): DockSnapshot | undefined {
    function visit(current: LayoutNode, path: number[]): DockSnapshot | undefined {
        if (current.type === "tabs") return undefined;

        for (let index = 0; index < current.children.length; index++) {
            const child = current.children[index];

            if (child.type === "tabs" && child.ids.includes(panelId)) {
                const beforePanelId = index > 0 ? getFirstPanelId(current.children[index - 1]) : undefined;
                const afterPanelId =
                    index < current.children.length - 1
                        ? getFirstPanelId(current.children[index + 1])
                        : undefined;

                return {
                    parentPath: path,
                    childIndex: index,
                    tabIndex: child.ids.indexOf(panelId),
                    parentDirection: current.direction,
                    beforePanelId,
                    afterPanelId,
                };
            }

            if (containsPanel(child, panelId)) {
                const found = visit(child, [...path, index]);
                if (found) return found;
            }
        }

        return undefined;
    }

    return visit(node, []);
}

export function restorePanelBySnapshot(
    node: LayoutNode,
    incoming: LayoutNode,
    snapshot: DockSnapshot
): LayoutNode | null {
    const panelId = getFirstPanelId(incoming);
    if (!panelId) return null;

    if (containsPanel(node, panelId)) return node;

    const tabPath = [...snapshot.parentPath, snapshot.childIndex];
    const originalTabGroup = getNodeAtPath(node, tabPath);

    if (originalTabGroup?.type === "tabs" && snapshot.tabIndex != null) {
        const restoredTabs = insertTabAtPath(node, tabPath, panelId, snapshot.tabIndex);
        if (restoredTabs) return restoredTabs;
    }

    const restoredChild = insertChildAtPath(node, snapshot.parentPath, snapshot.childIndex, incoming);
    if (restoredChild) return restoredChild;

    const beforeDirection: Direction = snapshot.parentDirection === "column" ? "bottom" : "right";
    const afterDirection: Direction = snapshot.parentDirection === "column" ? "top" : "left";

    if (snapshot.afterPanelId && containsPanel(node, snapshot.afterPanelId)) {
        return insertPanel(cloneNode(node), snapshot.afterPanelId, panelId, afterDirection);
    }

    if (snapshot.beforePanelId && containsPanel(node, snapshot.beforePanelId)) {
        return insertPanel(cloneNode(node), snapshot.beforePanelId, panelId, beforeDirection);
    }

    return null;
}
