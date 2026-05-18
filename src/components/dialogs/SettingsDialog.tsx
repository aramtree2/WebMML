import { useState, useSyncExternalStore } from "react";
import {
    getEditorSettings,
    setMmlMode,
    subscribeEditorSettings,
} from "../../core/editor/editorSettingsStore";
import { ChangeMMLMode } from "./ChangeMMLMode";
import { DialogFrame } from "./DialogFrame";
import "./SettingsDialog.css";

type SettingsDialogProps = {
    onClose: () => void;
};

export function SettingsDialog({ onClose }: SettingsDialogProps) {
    const settings = useSyncExternalStore(
        subscribeEditorSettings,
        getEditorSettings
    );
    const [changedMmlMode, setChangedMmlMode] = useState<boolean | null>(null);

    const handleChangeMmlMode = (enabled: boolean) => {
        setMmlMode(enabled);
        setChangedMmlMode(enabled);
    };

    return (
        <>
            <DialogFrame title="설정" onClose={onClose}>
                <div className="settings-dialog">
                    <label className="settings-dialog__row">
                        <span className="settings-dialog__label">MML 모드</span>
                        <span className="settings-dialog__switch">
                            <input
                                type="checkbox"
                                checked={settings.mmlMode}
                                onChange={(event) =>
                                    handleChangeMmlMode(event.target.checked)
                                }
                            />
                            <span className="settings-dialog__switch-track">
                                <span className="settings-dialog__switch-thumb" />
                            </span>
                        </span>
                    </label>
                </div>
            </DialogFrame>

            {changedMmlMode !== null && (
                <ChangeMMLMode
                    enabled={changedMmlMode}
                    onClose={() => setChangedMmlMode(null)}
                />
            )}
        </>
    );
}
