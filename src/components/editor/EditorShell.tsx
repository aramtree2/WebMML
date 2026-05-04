import { DialogHost } from "../dialogs/DialogHost";
import { useDialogState } from "../../hooks/useDialogState";
import type { DockingLayoutController } from "../../hooks/useDockingLayout";
import { MenuBar } from "./MenuBar";
import { Workspace } from "./Workspace";

type EditorShellProps = {
    docking: DockingLayoutController;
};

export function EditorShell({ docking }: EditorShellProps) {
    const { dialog, openDialog, closeDialog } = useDialogState();

    return (
        <>
            <MenuBar onOpenDialog={openDialog} />
            <Workspace docking={docking} />
            <DialogHost dialog={dialog} onClose={closeDialog} />
        </>
    );
}
