import { useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import { DialogFrame } from "./DialogFrame";

import { setWmlProject } from "../../core/wml/wmlStore";
import type { WmlProject } from "../../core/wml/wmlTypes";

import { midiToWml } from "../../core/parser/midiToWml";
import { mmlToWml, extractTracksInfo } from "../../core/parser/mmlToWml";

type ImportDialogProps = {
    onClose: () => void;
};

type TrackRow = {
    index: number;
    name: string;
    eventCount: number;
    instrument: number;
    section: number;
};

const MML_EXTS = ["mml", "mmi", "ms2mml", "txt"];
const MIDI_EXTS = ["mid", "midi"];
const ALLOWED_EXTS = [...MML_EXTS, ...MIDI_EXTS];

const INSTRUMENTS = [
    { value: 1, label: "피아노" },
    { value: 6, label: "일렉트릭 피아노" },
    { value: 22, label: "아코디언" },
    { value: 23, label: "하모니카" },
    { value: 25, label: "기타" },
    { value: 41, label: "바이올린" },
    { value: 43, label: "첼로" },
    { value: 57, label: "트럼펫" },
    { value: 74, label: "플루트" },
];

export function ImportDialog({ onClose }: ImportDialogProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [fileText, setFileText] = useState("");
    const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);

    const [numerator, setNumerator] = useState(4);
    const [denominator, setDenominator] = useState(4);

    const [tracks, setTracks] = useState<TrackRow[]>([]);
    const [error, setError] = useState("");

    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [dragTrackIndex, setDragTrackIndex] = useState<number | null>(null);
    const [instrumentModalIndex, setInstrumentModalIndex] =
        useState<number | null>(null);

    const getExt = (fileName: string) =>
        fileName.split(".").pop()?.toLowerCase() ?? "";

    const normalizeSections = (rows: TrackRow[]) => {
        const sectionOrder: number[] = [];

        rows.forEach((row) => {
            if (!sectionOrder.includes(row.section)) {
                sectionOrder.push(row.section);
            }
        });

        const sectionMap = new Map<number, number>();

        sectionOrder.forEach((section, index) => {
            sectionMap.set(section, index + 1);
        });

        return rows.map((row) => ({
            ...row,
            section: sectionMap.get(row.section) ?? row.section,
        }));
    };

    const selectFile = async (selectedFile: File) => {
        const ext = getExt(selectedFile.name);

        if (!ALLOWED_EXTS.includes(ext)) {
            setFile(null);
            setTracks([]);
            setError(".mmi, .ms2mml, .txt, .midi, .mid 파일만 가져올 수 있습니다.");
            return;
        }

        setError("");
        setFile(selectedFile);
        setTracks([]);
        setFileText("");
        setFileBuffer(null);

        try {
            if (MIDI_EXTS.includes(ext)) {
                const buffer = await selectedFile.arrayBuffer();
                setFileBuffer(buffer);

                const midi = new Midi(buffer);

                const rows: TrackRow[] = midi.tracks
                    .map((track, index) => ({
                        index,
                        name: track.name || `track ${index + 1}`,
                        eventCount: track.notes.length,
                        instrument: track.instrument.number + 1,
                        section: index + 1,
                    }))
                    .filter((row) => row.eventCount > 0);

                setTracks(rows);
            } else {
                const text = await selectedFile.text();
                setFileText(text);

                const infos = extractTracksInfo(text);

                const rows: TrackRow[] = infos.map((info, i) => ({
                    index: info.index,
                    name: `track ${i + 1}`,
                    eventCount: 0,
                    instrument: info.defaultInstrument,
                    section: i + 1,
                }));

                setTracks(rows);
            }
        } catch (err) {
            console.error(err);
            setError("파일 분석에 실패했습니다.");
        }
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

    const moveSection = (fromIndex: number, toIndex: number) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);
            const target = prev.find((row) => row.index === toIndex);

            if (!from || !target) return prev;
            if (from.section === target.section) return prev;

            const movingSection = from.section;
            const targetSection = target.section;

            const movingRows = prev.filter((row) => row.section === movingSection);
            const remainingRows = prev.filter((row) => row.section !== movingSection);

            const targetPos = remainingRows.findIndex(
                (row) => row.section === targetSection
            );

            if (targetPos === -1) return prev;

            const nextRows = [...remainingRows];
            nextRows.splice(targetPos, 0, ...movingRows);

            return normalizeSections(nextRows);
        });
    };

    const mergeSectionToSection = (fromIndex: number, targetIndex: number) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);     
            const target = prev.find((row) => row.index === targetIndex); 

            if (!from || !target) return prev;
            if (from.section === target.section) return prev;

            return normalizeSections(
                prev.map((row) =>
                    row.section === target.section
                        ? {
                            ...row,
                            section: from.section,
                            instrument: from.instrument,
                        }
                        : row
                )
            );
        });
    };

    const handleTrackDrop = (
        e: React.DragEvent<HTMLTableRowElement>,
        targetIndex: number
    ) => {
        e.preventDefault();

        if (dragTrackIndex === null || dragTrackIndex === targetIndex) {
            setDragTrackIndex(null);
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = y / rect.height;

        if (ratio > 0.25 && ratio < 0.75) {
            mergeSectionToSection(dragTrackIndex, targetIndex);
        } else {
            moveSection(dragTrackIndex, targetIndex);
        }

        setDragTrackIndex(null);
    };

    const changeInstrument = (trackIndex: number, instrument: number) => {
        setTracks((prev) => {
            const current = prev.find((row) => row.index === trackIndex);
            if (!current) return prev;

            return prev.map((row) =>
                row.section === current.section
                    ? {
                        ...row,
                        instrument,
                    }
                    : row
            );
        });
    };

    const handleImport = async () => {
        if (!file) {
            setError("먼저 파일을 선택하거나 드래그해 주세요.");
            return;
        }

        const ext = getExt(file.name);

        try {
            let wml: WmlProject;

            const instrumentOverrides = tracks.map((track) => track.instrument);

            if (MML_EXTS.includes(ext)) {
                wml = mmlToWml(fileText, {
                    title: file.name,
                    numerator,
                    denominator,
                    instrumentOverrides,
                });
            } else if (MIDI_EXTS.includes(ext)) {
                if (!fileBuffer) return;

                const selectedInstruments: Record<number, number> = {};

                tracks.forEach((track) => {
                    selectedInstruments[track.index] = track.instrument;
                });

                wml = midiToWml(fileBuffer, {
                    title: file.name,
                    selectedInstruments,
                });

                wml.timeSignatures = [
                    {
                        id: crypto.randomUUID(),
                        tick: 0,
                        numerator,
                        denominator,
                    },
                ];
            } else {
                setError(".mmi, .ms2mml, .txt, .midi, .mid 파일만 가져올 수 있습니다.");
                return;
            }

            setWmlProject(wml);
            onClose();
        } catch (err) {
            console.error(err);
            setError("파일 변환에 실패했습니다.");
        }
    };

    const selectedTrack =
        instrumentModalIndex !== null
            ? tracks.find((track) => track.index === instrumentModalIndex)
            : null;

    return (
        <DialogFrame title="가져오기" onClose={onClose} onConfirm={handleImport}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div
                    onClick={() => inputRef.current?.click()}
                    onDrop={handleFileDrop}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    style={{
                        border: isDraggingFile ? "2px solid #4f7cff" : "2px dashed #aaa",
                        borderRadius: 12,
                        padding: 28,
                        textAlign: "center",
                        cursor: "pointer",
                        background: isDraggingFile ? "#eef3ff" : "#fafafa",
                    }}
                >
                    <strong>파일을 클릭해서 선택하거나 여기에 드래그하세요.</strong>
                    <p style={{ fontSize: 13, color: "#666" }}>
                        지원 형식: .mmi, .ms2mml, .txt, .midi, .mid
                    </p>

                    {file && <p>선택된 파일: {file.name}</p>}
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".mmi,.ms2mml,.txt,.midi,.mid"
                    onChange={handleInputChange}
                    style={{ display: "none" }}
                />

                <div>
                    <h3>박자 설정</h3>

                    <label>
                        시작 박자:{" "}
                        <input
                            type="number"
                            min={1}
                            value={numerator}
                            onChange={(e) => setNumerator(Number(e.target.value))}
                            style={{ width: 60 }}
                        />
                        {" / "}
                        <input
                            type="number"
                            min={1}
                            value={denominator}
                            onChange={(e) => setDenominator(Number(e.target.value))}
                            style={{ width: 60 }}
                        />
                    </label>
                </div>

                {tracks.length > 0 && (
                    <div>
                        <h3>박자, 악기 설정 창</h3>

                        <p style={{ fontSize: 13, color: "#666" }}>
                            드래그해서 순서를 바꾸고, 다른 트랙 가운데에 놓으면 섹션 전체가
                            같은 섹션으로 합쳐집니다.
                        </p>

                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                border: "1px solid #ddd",
                            }}
                        >
                            <thead>
                                <tr>
                                    <th style={thStyle}>섹션</th>
                                    <th style={thStyle}>악기</th>
                                    <th style={thStyle}>트랙</th>
                                    <th style={thStyle}>이벤트 개수</th>
                                </tr>
                            </thead>

                            <tbody>
                                {tracks.map((track) => {
                                    const firstInSection =
                                        tracks.findIndex((t) => t.section === track.section) ===
                                        tracks.findIndex((t) => t.index === track.index);

                                    return (
                                        <tr
                                            key={track.index}
                                            draggable
                                            onDragStart={() => setDragTrackIndex(track.index)}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleTrackDrop(e, track.index)}
                                            style={{
                                                cursor: "grab",
                                                background:
                                                    dragTrackIndex === track.index ? "#f0f4ff" : "white",
                                            }}
                                        >
                                            <td style={tdStyle}>{firstInSection && track.section}</td>

                                            <td
                                                style={{
                                                    ...tdStyle,
                                                    cursor: "pointer",
                                                    fontWeight: firstInSection ? 600 : 400,
                                                }}
                                                onClick={() => setInstrumentModalIndex(track.index)}
                                            >
                                                {firstInSection
                                                    ? getInstrumentName(track.instrument)
                                                    : ""}
                                            </td>

                                            <td style={tdStyle}>{track.name}</td>

                                            <td style={tdStyle}>
                                                {track.eventCount > 0 ? track.eventCount : "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {error && <p style={{ color: "red" }}>{error}</p>}

                {selectedTrack && (
                    <div
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(0,0,0,0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 9999,
                        }}
                        onClick={() => setInstrumentModalIndex(null)}
                    >
                        <div
                            style={{
                                background: "white",
                                borderRadius: 12,
                                padding: 20,
                                width: 320,
                                maxHeight: 420,
                                overflowY: "auto",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3>악기 선택</h3>

                            {INSTRUMENTS.map((inst) => (
                                <button
                                    key={inst.value}
                                    onClick={() => {
                                        changeInstrument(selectedTrack.index, inst.value);
                                        setInstrumentModalIndex(null);
                                    }}
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        padding: 10,
                                        marginBottom: 8,
                                        textAlign: "left",
                                        border: "1px solid #ddd",
                                        borderRadius: 8,
                                        background:
                                            selectedTrack.instrument === inst.value
                                                ? "#eef3ff"
                                                : "white",
                                        cursor: "pointer",
                                    }}
                                >
                                    [{inst.value}] {inst.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </DialogFrame>
    );
}

function getInstrumentName(value: number) {
    return INSTRUMENTS.find((instrument) => instrument.value === value)?.label ?? `악기 ${value}`;
}

const thStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    padding: 10,
    textAlign: "left",
    background: "#f7f7f7",
};

const tdStyle: React.CSSProperties = {
    border: "1px solid #ddd",
    padding: 10,
};