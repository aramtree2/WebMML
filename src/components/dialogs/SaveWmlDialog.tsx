import { useState } from "react";
import { DialogFrame } from "./DialogFrame";

import { getWmlProject } from "../../core/wml/wmlStore";
import { normalizeWmlProject } from "../../core/wml/wmlUtils";

import "./ImportDialog.css";

type SaveWmlDialogProps = {
    onClose: () => void;
};

function getSafeFileName(filename: string) {
    return filename.replace(/[\\/:*?"<>|]/g, "_");
}

export function SaveWmlDialog({ onClose }: SaveWmlDialogProps) {
    const wml = getWmlProject();

    const [fileName, setFileName] = useState(
        wml.title?.trim() || "wml_project"
    );

    const [error, setError] = useState("");

    const handleSave = () => {
        if (!wml) {
            setError("저장할 WML 데이터가 없습니다.");
            return;
        }

        const trimmed = fileName.trim();

        if (!trimmed) {
            setError("파일 이름을 입력해 주세요.");
            return;
        }

        try {
            const normalized = normalizeWmlProject(wml);

            const json = JSON.stringify(normalized, null, 2);

            const blob = new Blob([json], {
                type: "application/json;charset=utf-8",
            });

            const url = URL.createObjectURL(blob);

            const a = document.createElement("a");

            a.href = url;
            a.download = `${getSafeFileName(trimmed)}.wml.json`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);

            onClose();
        } catch (err) {
            console.error(err);
            setError("WML 파일 저장에 실패했습니다.");
        }
    };

    return (
        <DialogFrame
            title="WML 저장"
            onClose={onClose}
            onConfirm={handleSave}
        >
            <div className="import-dialog">
                <div>
                    <h3>저장할 파일 이름</h3>

                    <input
                        className="save-wml-input"
                        type="text"
                        value={fileName}
                        onChange={(e) => {
                            setFileName(e.target.value);
                            setError("");
                        }}
                        placeholder="파일 이름 입력"
                    />

                    <p className="helper-text">
                        .wml.json 형식으로 저장됩니다.
                    </p>
                </div>

                {error && <p className="error-text">{error}</p>}
            </div>
        </DialogFrame>
    );
}