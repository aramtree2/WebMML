import { useState } from "react";
import type { DialogType } from "../types/dialog";

export function useDialogState() {
    const [dialog, setDialog] = useState<DialogType | null>(null);

    const openDialog = (type: DialogType) => {
        setDialog(type);
    };

    const closeDialog = () => {
        setDialog(null);
    };

    return {
        dialog,
        openDialog,
        closeDialog,
    };
}