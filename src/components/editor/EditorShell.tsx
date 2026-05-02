import type { DockingLayoutController } from "../../hooks/useDockingLayout";
import { MenuBar } from "./MenuBar";
import { Workspace } from "./Workspace";

type EditorShellProps = {
    docking: DockingLayoutController;
};

export function EditorShell({ docking }: EditorShellProps) {
    return (
        <div className="app">
            <MenuBar />
            <Workspace docking={docking} />
        </div>
    );
}
