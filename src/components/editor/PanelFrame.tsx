import type React from "react";
import type { DragInfo, DropPreview } from "../../types/layout";
import { renderPanel } from "../panels/panelRegistry";

type PanelFrameProps = {
    ids: string[];
    activeId: string;
    windowId: string | "main";
    dragInfo: DragInfo;
    dropPreview: DropPreview;
    mainPanelCount: number;
    isFloating: boolean;
    onDetach: (id: string) => void;
    onRestore: (id: string, windowId: string) => void;
    onSelectTab: (panelId: string, windowId: string | "main") => void;
    onDropPanel: (targetPanelId: string, targetWindowId: string | "main", e: React.DragEvent) => void;
    onDragOverPanel: (targetPanelId: string, e: React.DragEvent) => void;
    onDragStart: (info: DragInfo) => void;
    onDragEnd: () => void;
};

export function PanelFrame({
    ids,
    activeId,
    windowId,
    dragInfo,
    dropPreview,
    mainPanelCount,
    isFloating,
    onDetach,
    onRestore,
    onSelectTab,
    onDropPanel,
    onDragOverPanel,
    onDragStart,
    onDragEnd,
}: PanelFrameProps) {
    const currentActiveId = activeId || ids[0];
    const canDrag = isFloating || windowId !== "main" || mainPanelCount > 1;

    return (
        <div className="panel-frame">
            <div className="tab-bar">
                {ids.map((id) => (
                    <div
                        key={id}
                        className={`tab ${id === currentActiveId ? "active" : ""}`}
                        draggable={canDrag}
                        onClick={() => onSelectTab(id, windowId)}
                        onDragStart={(e) => {
                            if (!canDrag) {
                                e.preventDefault();
                                return;
                            }

                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", id);

                            onDragStart({ panelId: id, sourceWindowId: windowId });
                        }}
                        onDragEnd={onDragEnd}
                    >
                        {id}
                    </div>
                ))}
            </div>

            <div
                className="panel-area"
                onDragOver={(e) => onDragOverPanel(currentActiveId, e)}
                onDrop={(e) => onDropPanel(currentActiveId, windowId, e)}
            >
                {dragInfo && dropPreview?.targetId === currentActiveId && (
                    <div className={`drop-preview ${dropPreview.direction}`} />
                )}

                <div className="panel-toolbar">
                    {!isFloating && mainPanelCount > 1 && (
                        <button onClick={() => onDetach(currentActiveId)}>분리</button>
                    )}

                    {isFloating && (
                        <button onClick={() => onRestore(currentActiveId, windowId)}>되돌리기</button>
                    )}
                </div>

                {renderPanel(currentActiveId)}
            </div>
        </div>
    );
}
