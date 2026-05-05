import { useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import { DialogFrame } from "./DialogFrame";

import { setWmlProject } from "../../core/wml/wmlStore";
import type { WmlProject } from "../../core/wml/wmlTypes";

import { midiToWml } from "../../core/parser/midiToWml";
import { mmlToWml, extractTracksInfo } from "../../core/parser/mmlToWml";

import "./ImportDialog.css";

type ImportDialogProps = {
    onClose: () => void;
};

type TrackRow = {
    index: number;
    fixedTrackNumber: number;
    name: string;
    eventCount: number;
    instrument: number;
    originalInstrument: number;
    section: number;
};

type DropPreview = {
    targetIndex: number;
    position: "before" | "after" | "merge";
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
    const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
    const [instrumentModalIndex, setInstrumentModalIndex] =
        useState<number | null>(null);

    const getExt = (fileName: string) =>
        fileName.split(".").pop()?.toLowerCase() ?? "";

    const getSectionDisplayNumber = (section: number) => {
        const sectionOrder: number[] = [];

        tracks.forEach((track) => {
            if (!sectionOrder.includes(track.section)) {
                sectionOrder.push(track.section);
            }
        });

        return sectionOrder.indexOf(section) + 1;
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
                    .map((track, index) => {
                        const inst = track.instrument.number + 1;

                        return {
                            index,
                            fixedTrackNumber: index + 1,
                            name: track.name || `track ${index + 1}`,
                            eventCount: track.notes.length,
                            instrument: inst,
                            originalInstrument: inst,
                            section: index + 1,
                        };
                    })
                    .filter((row) => row.eventCount > 0);

                setTracks(rows);
            } else {
                const text = await selectedFile.text();
                setFileText(text);

                const infos = extractTracksInfo(text);

                const rows: TrackRow[] = infos.map((info, i) => ({
                    index: info.index,
                    fixedTrackNumber: i + 1,
                    name: `track ${i + 1}`,
                    eventCount: 0,
                    instrument: info.defaultInstrument,
                    originalInstrument: info.defaultInstrument,
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

    const moveSection = (
        fromIndex: number,
        toIndex: number,
        position: "before" | "after"
    ) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);
            const target = prev.find((row) => row.index === toIndex);

            if (!from || !target) return prev;
            if (from.section === target.section) return prev;

            const movingRows = prev.filter((row) => row.section === from.section);
            const remainingRows = prev.filter((row) => row.section !== from.section);

            const targetPositions = remainingRows
                .map((row, idx) => ({ row, idx }))
                .filter(({ row }) => row.section === target.section)
                .map(({ idx }) => idx);

            if (targetPositions.length === 0) return prev;

            const insertPos =
                position === "before"
                    ? targetPositions[0]
                    : targetPositions[targetPositions.length - 1] + 1;

            const nextRows = [...remainingRows];
            nextRows.splice(insertPos, 0, ...movingRows);

            return nextRows;
        });
    };

    const mergeSectionToSection = (fromIndex: number, targetIndex: number) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);
            const target = prev.find((row) => row.index === targetIndex);

            if (!from || !target) return prev;
            if (from.section === target.section) return prev;

            const fromSection = from.section;
            const targetSection = target.section;

            const fromRows = prev.filter((row) => row.section === fromSection);
            const targetRows = prev
                .filter((row) => row.section === targetSection)
                .map((row) => ({
                    ...row,
                    section: fromSection,
                    instrument: from.instrument,
                }));

            const otherRows = prev.filter(
                (row) => row.section !== fromSection && row.section !== targetSection
            );

            const insertPos = otherRows.findIndex((row) => {
                const originalTargetPos = prev.findIndex((p) => p.index === target.index);
                const rowOriginalPos = prev.findIndex((p) => p.index === row.index);
                return rowOriginalPos > originalTargetPos;
            });

            const mergedRows = [...fromRows, ...targetRows];

            if (insertPos === -1) {
                return [...otherRows, ...mergedRows];
            }

            const nextRows = [...otherRows];
            nextRows.splice(insertPos, 0, ...mergedRows);
            return nextRows;
        });
    };

    const handleTrackDragOver = (
        e: React.DragEvent<HTMLTableRowElement>,
        targetIndex: number
    ) => {
        e.preventDefault();

        if (dragTrackIndex === null || dragTrackIndex === targetIndex) {
            setDropPreview(null);
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = y / rect.height;

        if (ratio < 0.25) {
            setDropPreview({ targetIndex, position: "before" });
        } else if (ratio > 0.75) {
            setDropPreview({ targetIndex, position: "after" });
        } else {
            setDropPreview({ targetIndex, position: "merge" });
        }
    };

    const handleTrackDrop = (
        e: React.DragEvent<HTMLTableRowElement>,
        targetIndex: number
    ) => {
        e.preventDefault();

        if (dragTrackIndex === null || dragTrackIndex === targetIndex) {
            setDropPreview(null);
            setDragTrackIndex(null);
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = y / rect.height;

        if (ratio < 0.25) {
            moveSection(dragTrackIndex, targetIndex, "before");
        } else if (ratio > 0.75) {
            moveSection(dragTrackIndex, targetIndex, "after");
        } else {
            mergeSectionToSection(dragTrackIndex, targetIndex);
        }

        setDropPreview(null);
        setDragTrackIndex(null);
    };

    const splitSection = (section: number) => {
        setTracks((prev) => {
            const sectionRows = prev.filter((row) => row.section === section);

            if (sectionRows.length <= 1) return prev;

            let nextSection = Date.now();

            return prev.map((row) => {
                if (row.section !== section) return row;

                const newRow = {
                    ...row,
                    section: nextSection,
                    instrument: row.originalInstrument,
                };

                nextSection++;
                return newRow;
            });
        });
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
                          originalInstrument: instrument,
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

            const instrumentOverrides: number[] = [];
            tracks.forEach((track) => {
                instrumentOverrides[track.index] = track.instrument;
            });

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
                    <strong>파일을 클릭해서 선택하거나 여기에 드래그하세요.</strong>
                    <p className="helper-text">
                        지원 형식: .mmi, .ms2mml, .txt, .midi, .mid
                    </p>

                    {file && <p>선택된 파일: {file.name}</p>}
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".mmi,.ms2mml,.txt,.midi,.mid"
                    onChange={handleInputChange}
                    className="hidden-file-input"
                />

                <div>
                    <h3>박자 설정</h3>

                    <label>
                        시작 박자:{" "}
                        <input
                            className="time-input"
                            type="number"
                            min={1}
                            value={numerator || ""}
                            onChange={(e) => {
                                const value = e.target.value;
                                setNumerator(value === "" ? 0 : parseInt(value, 10));
                            }}
                        />
                        {" / "}
                        <input
                            className="time-input"
                            type="number"
                            min={1}
                            value={denominator || ""}
                            onChange={(e) => {
                                const value = e.target.value;
                                setDenominator(value === "" ? 0 : parseInt(value, 10));
                            }}
                        />
                    </label>
                </div>

                {tracks.length > 0 && (
                    <div>
                        <h3>박자, 악기 설정 창</h3>

                        <p className="helper-text">
                            드래그해서 순서를 바꾸고, 다른 트랙 가운데에 놓으면 섹션 전체가
                            같은 섹션으로 합쳐집니다. 섹션 번호를 더블클릭하면 섹션이 분리됩니다.
                        </p>

                        <table className="track-table">
                            <thead>
                                <tr>
                                    <th>섹션</th>
                                    <th>악기</th>
                                    <th>트랙</th>
                                    <th>이벤트 개수</th>
                                </tr>
                            </thead>

                            <tbody>
                                {tracks.map((track) => {
                                    const firstInSection =
                                        tracks.findIndex((t) => t.section === track.section) ===
                                        tracks.findIndex((t) => t.index === track.index);

                                    const preview =
                                        dropPreview?.targetIndex === track.index
                                            ? dropPreview.position
                                            : null;

                                    const rowClassName = [
                                        "track-row",
                                        dragTrackIndex === track.index ? "dragging" : "",
                                        preview === "before" ? "before" : "",
                                        preview === "after" ? "after" : "",
                                        preview === "merge" ? "merge" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ");

                                    return (
                                        <tr
                                            key={track.index}
                                            className={rowClassName}
                                            draggable
                                            onDragStart={() => setDragTrackIndex(track.index)}
                                            onDragOver={(e) => handleTrackDragOver(e, track.index)}
                                            onDragLeave={() => setDropPreview(null)}
                                            onDrop={(e) => handleTrackDrop(e, track.index)}
                                        >
                                            <td
                                                className={firstInSection ? "section-cell" : ""}
                                                onDoubleClick={() => {
                                                    if (firstInSection) {
                                                        splitSection(track.section);
                                                    }
                                                }}
                                                title={firstInSection ? "더블클릭하면 섹션을 분리합니다" : ""}
                                            >
                                                {firstInSection &&
                                                    getSectionDisplayNumber(track.section)}
                                            </td>

                                            <td
                                                className={`instrument-cell ${
                                                    firstInSection ? "section-head" : ""
                                                }`}
                                                onClick={() => setInstrumentModalIndex(track.index)}
                                            >
                                                {firstInSection
                                                    ? getInstrumentName(track.instrument)
                                                    : ""}
                                            </td>

                                            <td>{`track ${track.fixedTrackNumber}`}</td>

                                            <td>{track.eventCount > 0 ? track.eventCount : "-"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {error && <p className="error-text">{error}</p>}

                {selectedTrack && (
                    <div
                        className="instrument-overlay"
                        onClick={() => setInstrumentModalIndex(null)}
                    >
                        <div
                            className="instrument-modal"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3>악기 선택</h3>

                            {INSTRUMENTS.map((inst) => (
                                <button
                                    key={inst.value}
                                    className={`instrument-btn ${
                                        selectedTrack.instrument === inst.value ? "active" : ""
                                    }`}
                                    onClick={() => {
                                        changeInstrument(selectedTrack.index, inst.value);
                                        setInstrumentModalIndex(null);
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
    return (
        INSTRUMENTS.find((instrument) => instrument.value === value)?.label ??
        `악기 ${value}`
    );
}