import { useRef, useState } from "react";
import { DialogFrame } from "./DialogFrame";

import type { WmlProject } from "../../core/wml/wmlTypes";
import { setWmlProject } from "../../core/wml/wmlStore";
import { normalizeWmlProject } from "../../core/wml/wmlUtils";

import { playbackEngine } from "../../core/playback";
import { clearPaletteSelection } from "../../core/editor/paletteStore";
import { clearArrangementSelection } from "../../core/editor/arrangementControlStore";

import "./ImportDialog.css";

type OpenWmlDialogProps = {
    onClose: () => void;
};

const WML_EXTS = ["wml", "json"];

export function OpenWmlDialog({ onClose }: OpenWmlDialogProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [error, setError] = useState("");

    const getExt = (fileName: string) =>
        fileName.split(".").pop()?.toLowerCase() ?? "";

    const selectFile = async (selectedFile: File) => {
        const ext = getExt(selectedFile.name);

        if (!WML_EXTS.includes(ext)) {
            setFile(null);
            setError(".wml, .json 파일만 열 수 있습니다.");
            return;
        }

        setError("");
        setFile(selectedFile);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        selectFile(selectedFile);
    };

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingFile(false);

        const droppedFile = e.dataTransfer.files?.[0];
        if (!droppedFile) return;

        selectFile(droppedFile);
    };

    const handleOpen = async () => {
        if (!file) {
            setError("먼저 WML 파일을 선택하거나 드래그해 주세요.");
            return;
        }

        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as WmlProject;
            const validationError = validateWmlProject(parsed);

            if (validationError) {
                setError(
                    `호환되지 않는 WML 파일입니다.\n(${validationError})`
                );
                return;
            }
            const normalized = normalizeWmlProject(parsed);
            playbackEngine.stop();
            clearArrangementSelection();
            clearPaletteSelection();

            setWmlProject(normalized);
            onClose();
        } catch (err) {
            console.error(err);
            setError("WML 파일을 열 수 없습니다. JSON 형식이 올바른지 확인해 주세요.");
        }
    };

    return (
        <DialogFrame title="WML 열기" onClose={onClose} onConfirm={handleOpen}>
            <div className="import-dialog">
                <div
                    className={`drop-zone ${isDraggingFile ? "dragging" : ""}`}
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleFileDrop}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                >
                    <strong>WML 파일을 클릭해서 선택하거나 여기에 드래그하세요.</strong>

                    <p className="helper-text">지원 형식: .wml, .json</p>

                    {file && <p>선택된 파일: {file.name}</p>}
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".wml,.json,.wml.json,application/json"
                    onChange={handleInputChange}
                    className="hidden-file-input"
                />

                {error && <p className="error-text">{error}</p>}
            </div>
        </DialogFrame>
    );
}

function validateWmlProject(project: any): string | null {
    if (!project || typeof project !== "object") {
        return "잘못된 WML 파일입니다.";
    }
    if (!Array.isArray(project.sections)) {
        return "sections 배열이 존재하지 않습니다.";
    }

    if (!Array.isArray(project.tempos)) {
        return "tempos 배열이 존재하지 않습니다.";
    }

    if (!Array.isArray(project.timeSignatures)) {
        return "timeSignatures 배열이 존재하지 않습니다.";
    }


    for (const section of project.sections) {
        if (typeof section.instrument !== "string") {
            return "section.instrument는 문자열이어야 합니다.";
        }

        if (!Array.isArray(section.chords)) {
            return "section.chords 구조가 올바르지 않습니다.";
        }

        for (const chord of section.chords) {
            if (!chord || !Array.isArray(chord.notes)) {
                return "chord.notes 구조가 올바르지 않습니다.";
            }
        }
    }

    return null;
}