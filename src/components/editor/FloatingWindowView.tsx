import type React from "react";
import type {
    DragInfo,
    EdgeDirection,
    EdgePreview,
    FloatingWindow,
    DropPreview,
    LayoutNode,
} from "../../types/layout";
import { getTargetEdgePreview } from "../../utils/dropPosition";
import { LayoutView } from "./LayoutView";
import { getPanelTitle } from "../../constants/panels";

function getActivePanelId(node: LayoutNode): string | null {
    if (node.type === "tabs") {
        return node.activeId;
    }

    for (const child of node.children) {
        const found = getActivePanelId(child);
        if (found) return found;
    }

    return null;
}


type FloatingWindowViewProps = {
    win: FloatingWindow;
    setFloating: React.Dispatch<React.SetStateAction<FloatingWindow[]>>;
    dragInfo: DragInfo;
    dropPreview: DropPreview;
    mainPanelCount: number;
    onEdgePreview: (preview: EdgePreview) => void;
    onDockFloatingWindow: (
        draggedWindowId: string,
        targetWindowId: string | "main",
        direction: EdgeDirection
    ) => void;
    onDetach: (id: string) => void;
    onRestore: (id: string, windowId: string) => void;
    onSelectTab: (panelId: string, windowId: string | "main") => void;
    onDropPanel: (targetPanelId: string, targetWindowId: string | "main", e: React.DragEvent) => void;
    onDragOverPanel: (targetPanelId: string, e: React.DragEvent) => void;
    onDragStart: (info: DragInfo) => void;
    onDragEnd: () => void;
    onResizeSplit: (
        windowId: string | "main",
        path: number[],
        splitterIndex: number,
        deltaPercent: number,
        startSizes: number[]
    ) => void;
};

export function FloatingWindowView({
    win,
    setFloating,
    dragInfo,
    dropPreview,
    mainPanelCount,
    onEdgePreview,
    onDockFloatingWindow,
    onDetach,
    onRestore,
    onSelectTab,
    onDropPanel,
    onDragOverPanel,
    onDragStart,
    onDragEnd,
    onResizeSplit,
}: FloatingWindowViewProps) {
    const moveWindow = (e: React.MouseEvent) => {
        if (win.maximized) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const originX = win.x;
        const originY = win.y;
        let currentPreview: EdgePreview = null;

        const onMove = (ev: MouseEvent) => {
            const nextX = originX + ev.clientX - startX;
            const nextY = originY + ev.clientY - startY;
            const preview = getTargetEdgePreview(ev.clientX, ev.clientY, win.id);

            currentPreview = preview;
            onEdgePreview(preview);

            setFloating((prev) =>
                prev.map((w) => (w.id === win.id ? { ...w, x: nextX, y: nextY } : w))
            );
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            if (currentPreview) {
                onDockFloatingWindow(win.id, currentPreview.targetWindowId, currentPreview.direction);
            } else {
                onEdgePreview(null);
            }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    const resizeWindow = (e: React.MouseEvent, mode: "right" | "bottom" | "corner") => {
        e.stopPropagation();
        e.preventDefault();
        if (win.maximized) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = win.width;
        const startH = win.height;

        const onMove = (ev: MouseEvent) => {
            const nextWidth =
                mode === "right" || mode === "corner"
                    ? Math.max(260, startW + ev.clientX - startX)
                    : startW;

            const nextHeight =
                mode === "bottom" || mode === "corner"
                    ? Math.max(180, startH + ev.clientY - startY)
                    : startH;

            setFloating((prev) =>
                prev.map((w) =>
                    w.id === win.id ? { ...w, width: nextWidth, height: nextHeight } : w
                )
            );
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    };

    return (
        <div
            className={`floating-window ${win.maximized ? "maximized" : ""}`}
            data-dock-id={win.id}
            style={
                win.maximized
                    ? {}
                    : {
                          left: win.x,
                          top: win.y,
                          width: win.width,
                          height: win.height,
                      }
            }
        >
            <div className="floating-titlebar" onMouseDown={moveWindow}>
                <span>{getPanelTitle(getActivePanelId(win.layout) ?? win.title)}</span>

                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() =>
                        setFloating((prev) =>
                            prev.map((w) => (w.id === win.id ? { ...w, maximized: !w.maximized } : w))
                        )
                    }
                >
                    {win.maximized ? "🗗" : "🗖"}
                </button>
            </div>

            <div className="floating-content">
                <LayoutView
                    node={win.layout}
                    windowId={win.id}
                    path={[]}
                    dragInfo={dragInfo}
                    dropPreview={dropPreview}
                    mainPanelCount={mainPanelCount}
                    onDetach={onDetach}
                    onRestore={onRestore}
                    onSelectTab={onSelectTab}
                    onDropPanel={onDropPanel}
                    onDragOverPanel={onDragOverPanel}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onResizeSplit={onResizeSplit}
                    isFloating={true}
                />
            </div>

            {!win.maximized && (
                <>
                    <div className="resize-handle resize-right" onMouseDown={(e) => resizeWindow(e, "right")} />
                    <div className="resize-handle resize-bottom" onMouseDown={(e) => resizeWindow(e, "bottom")} />
                    <div className="resize-handle resize-corner" onMouseDown={(e) => resizeWindow(e, "corner")} />
                </>
            )}
        </div>
    );
}