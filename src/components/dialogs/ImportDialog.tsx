import { useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import { DialogFrame } from "./DialogFrame";

import { setWmlProject } from "../../core/wml/wmlStore";
import type { WmlProject } from "../../core/wml/wmlTypes";

import { midiToWml } from "../../core/parser/midiToWml";
import { mmlToWml, extractTracksInfo } from "../../core/parser/mmlToWml";

import { getAllInstrumentDefs } from "../../core/virtualInstrument/instrumentRegistry";

import "./ImportDialog.css";

type ImportDialogProps = {
    onClose: () => void;
};

type TrackRow = {
    index: number;
    fixedTrackNumber: number;
    name: string;
    eventCount: number;
    instrument: string;
    originalInstrument: string;
    section: number;
};

type DropPreview = {
    targetIndex: number;
    position: "before" | "after" | "merge";
};

const MML_EXTS = ["mml", "mmi", "ms2mml", "txt"];
const MIDI_EXTS = ["mid", "midi"];
const ALLOWED_EXTS = [...MML_EXTS, ...MIDI_EXTS];

const REGISTRY_INSTRUMENTS = getAllInstrumentDefs();

const INSTRUMENT_LABELS: Record<string, string> = {
    SGM_Piano: "피아노",
    SGM_Violin: "바이올린",
    SGM_Flute: "플룻",
};

const INSTRUMENTS = REGISTRY_INSTRUMENTS.map((instrument, index) => ({
    value: String(index + 1),
    label: INSTRUMENT_LABELS[instrument.id] ?? instrument.name,
    id: instrument.id,
}));

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

    const createNewSectionId = () =>
        Date.now() + Math.floor(Math.random() * 10000);

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
                        const inst =  String(track.instrument.number + 1);
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

    const detachTrackFromSection = (
        fromIndex: number,
        toIndex: number,
        position: "before" | "after"
    ) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);
            const target = prev.find((row) => row.index === toIndex);

            if (!from || !target) return prev;

            const sectionRows = prev.filter((row) => row.section === from.section);

            if (sectionRows.length <= 1) {
                return prev;
            }

            const detachedRow: TrackRow = {
                ...from,
                section: createNewSectionId(),
                instrument: from.originalInstrument,
            };

            const remainingRows = prev.filter((row) => row.index !== fromIndex);

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
            nextRows.splice(insertPos, 0, detachedRow);

            return nextRows;
        });
    };

    const moveOrDetachTrack = (
        fromIndex: number,
        toIndex: number,
        position: "before" | "after"
    ) => {
        const from = tracks.find((row) => row.index === fromIndex);
        if (!from) return;

        const sectionRows = tracks.filter((row) => row.section === from.section);

        if (sectionRows.length > 1) {
            detachTrackFromSection(fromIndex, toIndex, position);
        } else {
            moveSection(fromIndex, toIndex, position);
        }
    };

    const mergeSectionToSection = (fromIndex: number, targetIndex: number) => {
        setTracks((prev) => {
            const from = prev.find((row) => row.index === fromIndex);
            const target = prev.find((row) => row.index === targetIndex);

            if (!from || !target) return prev;
            if (from.section === target.section) return prev;

            return prev.map((row) =>
                row.section === target.section
                    ? {
                          ...row,
                          section: from.section,
                          instrument: from.instrument,
                      }
                    : row
            );
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
            moveOrDetachTrack(dragTrackIndex, targetIndex, "before");
        } else if (ratio > 0.75) {
            moveOrDetachTrack(dragTrackIndex, targetIndex, "after");
        } else {
            mergeSectionToSection(dragTrackIndex, targetIndex);
        }

        setDropPreview(null);
        setDragTrackIndex(null);
    };

    const changeInstrument = (trackIndex: number, instrument: string) => {
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

            const instrumentOverrides: string[] = [];
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

                const selectedInstruments: Record<number, string> = {};

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

            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("파일 변환에 실패했습니다.");
            }
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
                            가운데에 놓으면 섹션이 합쳐지고, 합쳐진 섹션의 트랙을
                            위/아래로 드래그하면 해당 트랙만 분리됩니다.
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
                                        tracks.findIndex(
                                            (t) => t.section === track.section
                                        ) ===
                                        tracks.findIndex(
                                            (t) => t.index === track.index
                                        );

                                    const preview =
                                        dropPreview?.targetIndex === track.index
                                            ? dropPreview.position
                                            : null;

                                    const rowClassName = [
                                        "track-row",
                                        dragTrackIndex === track.index
                                            ? "dragging"
                                            : "",
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
                                            onDragStart={() =>
                                                setDragTrackIndex(track.index)
                                            }
                                            onDragOver={(e) =>
                                                handleTrackDragOver(
                                                    e,
                                                    track.index
                                                )
                                            }
                                            onDragLeave={() =>
                                                setDropPreview(null)
                                            }
                                            onDrop={(e) =>
                                                handleTrackDrop(e, track.index)
                                            }
                                        >
                                            <td
                                                className={
                                                    firstInSection
                                                        ? "section-cell"
                                                        : ""
                                                }
                                            >
                                                {firstInSection &&
                                                    getSectionDisplayNumber(
                                                        track.section
                                                    )}
                                            </td>

                                            <td
                                                className={`instrument-cell ${
                                                    firstInSection
                                                        ? "section-head"
                                                        : ""
                                                }`}
                                                onClick={() =>
                                                    setInstrumentModalIndex(
                                                        track.index
                                                    )
                                                }
                                            >
                                                {firstInSection
                                                    ? getInstrumentName(
                                                          track.instrument
                                                      )
                                                    : ""}
                                            </td>

                                            <td>{`track ${track.fixedTrackNumber}`}</td>

                                            <td>
                                                {track.eventCount > 0
                                                    ? track.eventCount
                                                    : "-"}
                                            </td>
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
                                    key={inst.id}
                                    className={`instrument-btn ${
                                        selectedTrack.instrument === inst.value
                                            ? "active"
                                            : ""
                                    }`}
                                    onClick={() => {
                                        changeInstrument(
                                            selectedTrack.index,
                                            inst.value
                                        );
                                        setInstrumentModalIndex(null);
                                    }}
                                >
                                    {inst.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </DialogFrame>
    );
}

function getInstrumentName(value: string) {
    return (
        INSTRUMENTS.find((instrument) => instrument.value === value)?.label ??
        `악기 ${value}`
    );
}