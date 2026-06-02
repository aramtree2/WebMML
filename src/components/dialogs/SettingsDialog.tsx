import { useState, useSyncExternalStore } from "react";
import {
    getEditorSettings,
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

    const [pendingMmlMode, setPendingMmlMode] = useState<boolean | null>(null);

    const handleRequestChangeMmlMode = (enabled: boolean) => {
        setPendingMmlMode(enabled);
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
                                    handleRequestChangeMmlMode(
                                        event.target.checked
                                    )
                                }
                            />

                            <span className="settings-dialog__switch-track">
                                <span className="settings-dialog__switch-thumb" />
                            </span>
                        </span>
                    </label>
                </div>
            </DialogFrame>

            {pendingMmlMode !== null && (
                <ChangeMMLMode
                    enabled={pendingMmlMode}
                    onConfirm={() => setPendingMmlMode(null)}
                    onClose={() => setPendingMmlMode(null)}
                />
            )}
        </>
    );
}