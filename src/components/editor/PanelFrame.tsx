import type React from "react";
import type { DragInfo, DropPreview } from "../../types/layout";
import { renderPanel } from "../panels/panelRegistry";
import { getPanelTitle } from "../../constants/panels";

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
    const canDetach = !isFloating && mainPanelCount > 1;
    const canRestore = isFloating && windowId !== "main";

    const handleTabDoubleClick = (id: string) => {
        if (canRestore) {
            onRestore(id, windowId);
            return;
        }

        if (canDetach) {
            onDetach(id);
        }
    };

    return (
        <div className="panel-frame">
            <div className="tab-bar">
                {ids.map((id) => (
                    <div
                        key={id}
                        className={`tab ${id === currentActiveId ? "active" : ""}`}
                        draggable={canDrag}
                        title={isFloating ? "탭을 더블클릭하면 되돌리기" : "탭을 더블클릭하면 분리"}
                        onClick={() => onSelectTab(id, windowId)}
                        onDoubleClick={() => handleTabDoubleClick(id)}
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
                        {getPanelTitle(id)}
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

                {renderPanel(currentActiveId)}
            </div>
        </div>
    );
}
