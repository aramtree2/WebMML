import type React from "react";
import type { DockingLayoutController } from "../../hooks/useDockingLayout";
import { getTargetEdgePreview } from "../../utils/dropPosition";
import { FloatingWindowView } from "./FloatingWindowView";
import { LayoutView } from "./LayoutView";

type WorkspaceProps = {
    docking: DockingLayoutController;
};

export function Workspace({ docking }: WorkspaceProps) {
    const handleWorkspaceDragOver = (e: React.DragEvent) => {
        if (!docking.dragInfo) return;

        e.preventDefault();
        const preview = getTargetEdgePreview(e.clientX, e.clientY, null);
        docking.setEdgePreview(preview);
    };

    return (
        <main className="workspace" onDragOver={handleWorkspaceDragOver} onDrop={docking.handleWorkspaceDrop}>
            <div className="main-dock" data-dock-id="main">
                <LayoutView
                    node={docking.mainLayout}
                    windowId="main"
                    path={[]}
                    dragInfo={docking.dragInfo}
                    dropPreview={docking.dropPreview}
                    mainPanelCount={docking.mainPanelCount}
                    onDetach={docking.detachPanel}
                    onRestore={docking.restorePanel}
                    onSelectTab={docking.handleSelectTab}
                    onDropPanel={docking.handleDropOnPanel}
                    onDragOverPanel={docking.handleDragOverPanel}
                    onDragStart={docking.setDragInfo}
                    onDragEnd={docking.clearDragState}
                    onResizeSplit={docking.handleResizeSplit}
                    isFloating={false}
                />
            </div>

            {docking.edgePreview && <div className="edge-dock-preview" style={docking.edgePreview.rect} />}

            {docking.floating.map((win) => (
                <FloatingWindowView
                    key={win.id}
                    win={win}
                    setFloating={docking.setFloating}
                    dragInfo={docking.dragInfo}
                    dropPreview={docking.dropPreview}
                    mainPanelCount={docking.mainPanelCount}
                    onEdgePreview={docking.setEdgePreview}
                    onDockFloatingWindow={docking.dockFloatingWindow}
                    onDetach={docking.detachPanel}
                    onRestore={docking.restorePanel}
                    onSelectTab={docking.handleSelectTab}
                    onDropPanel={docking.handleDropOnPanel}
                    onDragOverPanel={docking.handleDragOverPanel}
                    onDragStart={docking.setDragInfo}
                    onDragEnd={docking.clearDragState}
                    onResizeSplit={docking.handleResizeSplit}
                />
            ))}
        </main>
    );
}
