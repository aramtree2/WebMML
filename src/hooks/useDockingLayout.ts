import type React from "react";
import { useState } from "react";
import type {
    DragInfo,
    EdgeDirection,
    EdgePreview,
    EditorLayoutState,
    FloatingWindow,
    LayoutNode,
    DropPreview,
} from "../types/layout";
import { getDropDirection } from "../utils/dropPosition";
import {
    cloneNode,
    countPanels,
    insertPanel,
    removePanel,
    resizeSplitAtPath,
    setActivePanel,
    splitPanelBySelf,
    wrapLayoutByEdge,
} from "../utils/layoutTree";

export function useDockingLayout(initialState: EditorLayoutState) {
    const [mainLayout, setMainLayout] = useState<LayoutNode>(initialState.mainLayout);
    const [floating, setFloating] = useState<FloatingWindow[]>(initialState.floating);
    const [dragInfo, setDragInfo] = useState<DragInfo>(null);
    const [dropPreview, setDropPreview] = useState<DropPreview>(null);
    const [edgePreview, setEdgePreview] = useState<EdgePreview>(null);

    const mainPanelCount = countPanels(mainLayout);

    const detachPanel = (panelId: string) => {
        if (countPanels(mainLayout) <= 1) return;

        setMainLayout((prev) => removePanel(prev, panelId) ?? prev);

        setFloating((prev) => [
            ...prev,
            {
                id: `float-${panelId}-${Date.now()}`,
                title: panelId,
                x: 160 + prev.length * 40,
                y: 100 + prev.length * 40,
                width: 420,
                height: 280,
                maximized: false,
                layout: { type: "tabs", ids: [panelId], activeId: panelId },
            },
        ]);
    };

    const restorePanel = (panelId: string, windowId: string) => {
        setFloating((prev) =>
            prev
                .map((win) => ({ ...win, layout: removePanel(win.layout, panelId) }))
                .filter((win) => win.layout !== null) as FloatingWindow[]
        );

        setMainLayout((prev) => ({
            type: "split",
            direction: "row",
            children: [prev, { type: "tabs", ids: [panelId], activeId: panelId }],
            sizes: [75, 25],
        }));
    };

    const handleSelectTab = (panelId: string, windowId: string | "main") => {
        if (windowId === "main") {
            setMainLayout((prev) => setActivePanel(prev, panelId));
            return;
        }

        setFloating((prev) =>
            prev.map((win) =>
                win.id === windowId ? { ...win, layout: setActivePanel(win.layout, panelId) } : win
            )
        );
    };

    const dockFloatingWindow = (
        draggedWindowId: string,
        targetWindowId: string | "main",
        direction: EdgeDirection
    ) => {
        const dragged = floating.find((win) => win.id === draggedWindowId);
        if (!dragged) return;

        if (targetWindowId === "main") {
            setMainLayout((prev) => wrapLayoutByEdge(prev, dragged.layout, direction));
            setFloating((prev) => prev.filter((win) => win.id !== draggedWindowId));
        } else {
            setFloating((prev) =>
                prev
                    .filter((win) => win.id !== draggedWindowId)
                    .map((win) =>
                        win.id === targetWindowId
                            ? { ...win, layout: wrapLayoutByEdge(win.layout, dragged.layout, direction) }
                            : win
                    )
            );
        }

        setEdgePreview(null);
    };

    const dockPanelToEdge = (
        panelId: string,
        sourceWindowId: string | "main",
        targetWindowId: string | "main",
        direction: EdgeDirection
    ) => {
        if (sourceWindowId === "main" && mainPanelCount <= 1) return;

        const incoming: LayoutNode = { type: "tabs", ids: [panelId], activeId: panelId };

        if (sourceWindowId === "main" && targetWindowId === "main") {
            setMainLayout((prev) => {
                const removed = removePanel(prev, panelId);
                if (!removed) return prev;
                return wrapLayoutByEdge(removed, incoming, direction);
            });

            clearDragState();
            return;
        }

        if (sourceWindowId !== "main" && targetWindowId === sourceWindowId) {
            setFloating((prev) =>
                prev.map((win) => {
                    if (win.id !== sourceWindowId) return win;

                    const removed = removePanel(win.layout, panelId);
                    if (!removed) return win;

                    return { ...win, layout: wrapLayoutByEdge(removed, incoming, direction) };
                })
            );

            clearDragState();
            return;
        }

        if (sourceWindowId === "main") {
            setMainLayout((prev) => removePanel(prev, panelId) ?? prev);
        } else {
            setFloating((prev) =>
                prev
                    .map((win) =>
                        win.id === sourceWindowId
                            ? { ...win, layout: removePanel(win.layout, panelId) }
                            : win
                    )
                    .filter((win) => win.layout !== null) as FloatingWindow[]
            );
        }

        if (targetWindowId === "main") {
            setMainLayout((prev) => wrapLayoutByEdge(prev, incoming, direction));
        } else {
            setFloating((prev) =>
                prev.map((win) =>
                    win.id === targetWindowId
                        ? { ...win, layout: wrapLayoutByEdge(win.layout, incoming, direction) }
                        : win
                )
            );
        }

        clearDragState();
    };

    const removeDraggingPanelEverywhere = (panelId: string) => {
        setMainLayout((prev) => removePanel(prev, panelId) ?? prev);

        setFloating((prev) =>
            prev
                .map((win) => ({ ...win, layout: removePanel(win.layout, panelId) }))
                .filter((win) => win.layout !== null) as FloatingWindow[]
        );
    };

    const handleDropOnPanel = (
        targetPanelId: string,
        targetWindowId: string | "main",
        e: React.DragEvent
    ) => {
        e.preventDefault();
        e.stopPropagation();

        if (!dragInfo) return;

        if (edgePreview) {
            dockPanelToEdge(
                dragInfo.panelId,
                dragInfo.sourceWindowId,
                edgePreview.targetWindowId,
                edgePreview.direction
            );
            return;
        }

        const movingPanel = dragInfo.panelId;

        if (dragInfo.sourceWindowId === "main" && mainPanelCount <= 1) {
            clearDragState();
            return;
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const direction = getDropDirection(rect, e.clientX, e.clientY);

        if (movingPanel === targetPanelId) {
            if (direction === "center") {
                clearDragState();
                return;
            }

            if (targetWindowId === "main") {
                setMainLayout((prev) => splitPanelBySelf(prev, movingPanel, direction));
            } else {
                setFloating((prev) =>
                    prev.map((win) =>
                        win.id === targetWindowId
                            ? { ...win, layout: splitPanelBySelf(win.layout, movingPanel, direction) }
                            : win
                    )
                );
            }

            clearDragState();
            return;
        }

        removeDraggingPanelEverywhere(movingPanel);

        if (targetWindowId === "main") {
            setMainLayout((prev) => insertPanel(cloneNode(prev), targetPanelId, movingPanel, direction));
        } else {
            setFloating((prev) =>
                prev.map((win) =>
                    win.id === targetWindowId
                        ? {
                              ...win,
                              layout: insertPanel(cloneNode(win.layout), targetPanelId, movingPanel, direction),
                          }
                        : win
                )
            );
        }

        clearDragState();
    };

    const handleDragOverPanel = (targetPanelId: string, e: React.DragEvent) => {
        e.preventDefault();

        if (!dragInfo || edgePreview || (dragInfo.sourceWindowId === "main" && mainPanelCount <= 1)) {
            setDropPreview(null);
            return;
        }

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const direction = getDropDirection(rect, e.clientX, e.clientY);

        if (dragInfo.panelId === targetPanelId && direction === "center") {
            setDropPreview(null);
            return;
        }

        setDropPreview({ targetId: targetPanelId, direction });
    };

    const handleWorkspaceDrop = (e: React.DragEvent) => {
        if (!dragInfo) return;

        e.preventDefault();

        if (edgePreview) {
            dockPanelToEdge(
                dragInfo.panelId,
                dragInfo.sourceWindowId,
                edgePreview.targetWindowId,
                edgePreview.direction
            );
        }

        clearDragState();
    };

    const handleResizeSplit = (
        windowId: string | "main",
        path: number[],
        splitterIndex: number,
        deltaPercent: number,
        startSizes: number[]
    ) => {
        if (windowId === "main") {
            setMainLayout((prev) => resizeSplitAtPath(prev, path, splitterIndex, deltaPercent, startSizes));
            return;
        }

        setFloating((prev) =>
            prev.map((win) =>
                win.id === windowId
                    ? {
                          ...win,
                          layout: resizeSplitAtPath(
                              win.layout,
                              path,
                              splitterIndex,
                              deltaPercent,
                              startSizes
                          ),
                      }
                    : win
            )
        );
    };

    function clearDragState() {
        setDragInfo(null);
        setDropPreview(null);
        setEdgePreview(null);
    }

    return {
        mainLayout,
        floating,
        setFloating,
        dragInfo,
        dropPreview,
        edgePreview,
        mainPanelCount,
        setDragInfo,
        setEdgePreview,
        detachPanel,
        restorePanel,
        handleSelectTab,
        dockFloatingWindow,
        dockPanelToEdge,
        handleDropOnPanel,
        handleDragOverPanel,
        handleWorkspaceDrop,
        handleResizeSplit,
        clearDragState,
    };
}

export type DockingLayoutController = ReturnType<typeof useDockingLayout>;
