import { useState } from "react";
import { DialogFrame } from "./DialogFrame";

import { getWmlProject, setWmlProject } from "../../core/wml/wmlStore";
import { setMmlMode } from "../../core/editor/editorSettingsStore";
import {
    convertWmlToMmlMode,
    convertWmlToNormalMode,
} from "../../core/wml/wmlMmlMode";

import "./ImportDialog.css";

type ChangeMMLModeProps = {
    enabled: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

export function ChangeMMLMode({
    enabled,
    onClose,
    onConfirm
}: ChangeMMLModeProps) {
    const [error, setError] = useState("");

    const handleConfirm = () => {
        try {
            const currentWml = getWmlProject();

            if (enabled) {
                const converted = convertWmlToMmlMode(currentWml);

                setWmlProject(converted);
                setMmlMode(true);
            } else {
                const converted = convertWmlToNormalMode(currentWml);

                setWmlProject(converted);
                setMmlMode(false);
            }

            onConfirm();
        } catch (err) {
            console.error(err);
            setError("MML 모드 변경 중 오류가 발생했습니다.");
        }
    };

    return (
        <DialogFrame
            title={enabled ? "MML 모드 켜기" : "MML 모드 끄기"}
            onClose={onClose}
            onConfirm={handleConfirm}
        >
            <div className="import-dialog">
                <h3>
                    {enabled
                        ? "화음을 MML 모드 구조로 분리합니다."
                        : "분리된 화음을 일반 구조로 병합합니다."}
                </h3>

                <p className="helper-text">
                    {enabled
                        ? "한 화음 안의 여러 노트를 각각 별도 화음으로 분리합니다. 확인 후 MML 모드가 활성화됩니다."
                        : "같은 tick에 있는 노트들을 다시 하나의 화음으로 병합합니다."}
                </p>

                {error && <p className="error-text">{error}</p>}
            </div>
        </DialogFrame>
    );
}