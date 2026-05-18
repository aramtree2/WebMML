import type { DialogType } from "../../types/dialog";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { SettingsDialog } from "./SettingsDialog";
import { OpenWmlDialog } from "./OpenWmlDialog";
import { SaveWmlDialog } from "./SaveWmlDialog";

type DialogHostProps = {
    dialog: DialogType | null;
    onClose: () => void;
};

export function DialogHost({ dialog, onClose }: DialogHostProps) {
    if (!dialog) return null;

    if (dialog === "export") {
        return <ExportDialog onClose={onClose} />;
    }

    if (dialog === "import") {
        return <ImportDialog onClose={onClose} />;
    }

    if (dialog === "settings") {
        return <SettingsDialog onClose={onClose} />;
    }
    if (dialog === "openWml") {
        return <OpenWmlDialog onClose={onClose} />;
    }
    if (dialog === "saveWml") {
        return <SaveWmlDialog onClose={onClose} />;
    }
    return null;
}
