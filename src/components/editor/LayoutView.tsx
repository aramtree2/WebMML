import React from "react";
import type { DragInfo, DropPreview, LayoutNode } from "../../types/layout";
import { PanelFrame } from "./PanelFrame";

type LayoutViewProps = {
    node: LayoutNode;
    windowId: string | "main";
    path: number[];
    dragInfo: DragInfo;
    dropPreview: DropPreview;
    mainPanelCount: number;
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
    isFloating: boolean;
};

export function LayoutView({
    node,
    windowId,
    path,
    dragInfo,
    dropPreview,
    mainPanelCount,
    onDetach,
    onRestore,
    onSelectTab,
    onDropPanel,
    onDragOverPanel,
    onDragStart,
    onDragEnd,
    onResizeSplit,
    isFloating,
}: LayoutViewProps) {
    if (node.type === "split") {
        const sizes = node.sizes ?? Array(node.children.length).fill(100 / node.children.length);

        const startResize = (e: React.MouseEvent, splitterIndex: number) => {
            e.preventDefault();
            e.stopPropagation();

            const parent = e.currentTarget.parentElement;
            if (!parent) return;

            const rect = parent.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const count = node.children.length;
            const startSizes = node.sizes ?? Array(count).fill(100 / count);

            const onMove = (ev: MouseEvent) => {
                const deltaPx = node.direction === "row" ? ev.clientX - startX : ev.clientY - startY;
                const totalPx = node.direction === "row" ? rect.width : rect.height;
                const deltaPercent = (deltaPx / totalPx) * 100;

                onResizeSplit(windowId, path, splitterIndex, deltaPercent, startSizes);
            };

            const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            };

            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        };

        return (
            <div className={`split ${node.direction}`}>
                {node.children.map((child, index) => (
                    <React.Fragment key={index}>
                        <div
                            className="split-child"
                            style={{
                                flexBasis: `${sizes[index]}%`,
                                flexGrow: 0,
                                flexShrink: 0,
                            }}
                        >
                            <LayoutView
                                node={child}
                                windowId={windowId}
                                path={[...path, index]}
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
                                isFloating={isFloating}
                            />
                        </div>

                        {index < node.children.length - 1 && (
                            <div
                                className={`splitter ${
                                    node.direction === "row" ? "splitter-vertical" : "splitter-horizontal"
                                }`}
                                onMouseDown={(e) => startResize(e, index)}
                            />
                        )}
                    </React.Fragment>
                ))}
            </div>
        );
    }

    return (
        <PanelFrame
            ids={node.ids}
            activeId={node.activeId}
            windowId={windowId}
            dragInfo={dragInfo}
            dropPreview={dropPreview}
            mainPanelCount={mainPanelCount}
            isFloating={isFloating}
            onDetach={onDetach}
            onRestore={onRestore}
            onSelectTab={onSelectTab}
            onDropPanel={onDropPanel}
            onDragOverPanel={onDragOverPanel}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        />
    );
}
