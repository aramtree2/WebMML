import { useMemo, useState } from "react";
import { DialogFrame } from "./DialogFrame";

import { getWmlProject } from "../../core/wml/wmlStore";
import { wmlToMml } from "../../core/export/wmlToMml";
import { wmlToMidi } from "../../core/export/wmlToMidi";
import { DEFAULT_INSTRUMENT_ID } from "../../core/virtualInstrument/instrumentRegistry";
import { INSTRUMENT_LABELS } from "../../core/parser/instrumentMappings";
import "./ExportDialog.css";

type ExportDialogProps = {
    onClose: () => void;
};

type ExportType = "mml" | "midi";
type Step = "select" | "format";

export function ExportDialog({ onClose }: ExportDialogProps) {
    const [step, setStep] = useState<Step>("select");
    const [exportType, setExportType] = useState<ExportType>("mml");
    const [selectedChordKeys, setSelectedChordKeys] = useState<string[]>([]);
    const [openedSections, setOpenedSections] = useState<number[]>([]);

    const wml = getWmlProject();

    const normalizedWml = useMemo(() => {
        return normalizeWmlForExport(wml);
    }, [wml]);

    const allChordKeys = useMemo(() => {
        const keys: string[] = [];

        normalizedWml.sections.forEach((section: any, sectionIndex: number) => {
            section.chords.forEach((_chord: any, chordIndex: number) => {
                keys.push(getChordKey(sectionIndex, chordIndex));
            });
        });

        return keys;
    }, [normalizedWml]);

    const selectedKeys =
        selectedChordKeys.length === 0 ? allChordKeys : selectedChordKeys;

    const toggleOpenSection = (sectionIndex: number) => {
        setOpenedSections((prev) => {
            if (prev.includes(sectionIndex)) {
                return prev.filter((index) => index !== sectionIndex);
            }

            return [...prev, sectionIndex];
        });
    };

    const handleToggleChord = (key: string) => {
        const base =
            selectedChordKeys.length === 0
                ? [...allChordKeys]
                : [...selectedChordKeys];

        if (base.includes(key)) {
            setSelectedChordKeys(base.filter((item) => item !== key));
        } else {
            setSelectedChordKeys([...base, key]);
        }
    };

    const handleToggleSection = (sectionIndex: number) => {
        const section = normalizedWml.sections[sectionIndex];
        if (!section) return;

        const sectionKeys = section.chords.map((_chord: any, chordIndex: number) =>
            getChordKey(sectionIndex, chordIndex)
        );

        const base =
            selectedChordKeys.length === 0
                ? [...allChordKeys]
                : [...selectedChordKeys];

        const isAllSelected = sectionKeys.every((key: string) =>
            base.includes(key)
        );

        if (isAllSelected) {
            setSelectedChordKeys(base.filter((key) => !sectionKeys.includes(key)));
        } else {
            const next = [...base];

            sectionKeys.forEach((key: string) => {
                if (!next.includes(key)) {
                    next.push(key);
                }
            });

            setSelectedChordKeys(next);
        }
    };

    const handleConfirm = () => {
        if (!wml) {
            alert("저장된 WML 데이터가 없습니다.");
            return;
        }

        if (step === "select") {
            if (selectedKeys.length === 0) {
                alert("내보낼 섹션 또는 화음을 선택해주세요.");
                return;
            }

            setStep("format");
            return;
        }

        const exportWml = makeSelectedWml(normalizedWml, selectedKeys);
        const title = getSafeFileName(wml.title || "exported_music");

        if (exportType === "mml") {
            const mmlText = wmlToMml(exportWml);
            downloadTextFile(mmlText, `${title}.txt`);
        } else {
            const midi = wmlToMidi(exportWml);
            downloadMidiFile(midi, `${title}.mid`);
        }

        onClose();
    };

    return (
        <DialogFrame title="내보내기" onClose={onClose} onConfirm={handleConfirm}>
            <div className="export-dialog">
                {step === "select" && (
                    <div>
                        <h3 className="export-dialog-title">섹션, 화음 선택</h3>

                        <div className="export-table-wrap">
                            <table className="export-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th></th>
                                        <th>#</th>
                                        <th>트랙 이름</th>
                                        <th>악기</th>
                                        <th>파트</th>
                                        <th>개수</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {normalizedWml.sections.map(
                                        (section: any, sectionIndex: number) => {
                                            const sectionKeys = section.chords.map(
                                                (_chord: any, chordIndex: number) =>
                                                    getChordKey(sectionIndex, chordIndex)
                                            );

                                            const sectionChecked =
                                                sectionKeys.length > 0 &&
                                                sectionKeys.every((key: string) =>
                                                    selectedKeys.includes(key)
                                                );

                                            return (
                                                <SectionRows
                                                    key={`section-${sectionIndex}`}
                                                    section={section}
                                                    sectionIndex={sectionIndex}
                                                    sectionChecked={sectionChecked}
                                                    selectedKeys={selectedKeys}
                                                    isOpen={openedSections.includes(
                                                        sectionIndex
                                                    )}
                                                    onToggleOpen={toggleOpenSection}
                                                    onToggleSection={handleToggleSection}
                                                    onToggleChord={handleToggleChord}
                                                />
                                            );
                                        }
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {step === "format" && (
                    <div>
                        <h3 className="export-dialog-title">
                            내보낼 파일 형식 선택
                        </h3>

                        <label className="export-radio">
                            <input
                                type="radio"
                                name="exportType"
                                checked={exportType === "mml"}
                                onChange={() => setExportType("mml")}
                            />
                            MML 텍스트 파일 (.txt)
                        </label>

                        <label className="export-radio">
                            <input
                                type="radio"
                                name="exportType"
                                checked={exportType === "midi"}
                                onChange={() => setExportType("midi")}
                            />
                            MIDI 파일 (.mid)
                        </label>

                        <button
                            className="export-back-button"
                            type="button"
                            onClick={() => setStep("select")}
                        >
                            이전
                        </button>
                    </div>
                )}
            </div>
        </DialogFrame>
    );
}

type SectionRowsProps = {
    section: any;
    sectionIndex: number;
    sectionChecked: boolean;
    selectedKeys: string[];
    isOpen: boolean;
    onToggleOpen: (sectionIndex: number) => void;
    onToggleSection: (sectionIndex: number) => void;
    onToggleChord: (key: string) => void;
};

function SectionRows({
    section,
    sectionIndex,
    sectionChecked,
    selectedKeys,
    isOpen,
    onToggleOpen,
    onToggleSection,
    onToggleChord,
}: SectionRowsProps) {
    const totalNoteCount = section.chords.reduce((sum: number, chord: any) => {
        return sum + getChordNoteCount(chord);
    }, 0);

    return (
        <>
            <tr className="export-section-row">
                <td>
                    <button
                        type="button"
                        className="export-fold-button"
                        onClick={() => onToggleOpen(sectionIndex)}
                    >
                        {isOpen ? "▼" : "▶"}
                    </button>
                </td>

                <td>
                    <input
                        type="checkbox"
                        checked={sectionChecked}
                        onChange={() => onToggleSection(sectionIndex)}
                    />
                </td>

                <td>{sectionIndex + 1}</td>

                <td>
                    {section.name ||
                        section.trackName ||
                        section.title ||
                        `Section ${sectionIndex + 1}`}
                </td>

                <td>{getInstrumentLabel(section.instrument)}</td>

                <td>섹션</td>
                <td>{section.chords.length}화음 / {totalNoteCount}노트</td>
            </tr>

            {isOpen &&
                section.chords.map((chord: any, chordIndex: number) => {
                    const key = getChordKey(sectionIndex, chordIndex);

                    return (
                        <tr className="export-chord-row" key={key}>
                            <td></td>

                            <td>
                                <input
                                    type="checkbox"
                                    checked={selectedKeys.includes(key)}
                                    onChange={() => onToggleChord(key)}
                                />
                            </td>

                            <td></td>
                            <td></td>
                            <td></td>
                            <td>화음{chordIndex + 1}</td>
                            <td>{getChordNoteCount(chord)}노트</td>
                        </tr>
                    );
                })}
        </>
    );
}

function getChordKey(sectionIndex: number, chordIndex: number) {
    return `${sectionIndex}-${chordIndex}`;
}

function normalizeWmlForExport(wml: any) {
    return {
        ...wml,
        timeSignatures: wml?.timeSignatures ?? wml?.["Time Signatures"] ?? [],
        tempos: wml?.tempos ?? wml?.Tempo ?? [],
        sections: (wml?.sections ?? wml?.Sections ?? []).map((section: any) => ({
            ...section,
            instrument: section.instrument ?? DEFAULT_INSTRUMENT_ID,
            sustain: section.sustain ?? section.Sustain ?? [],
            chords: normalizeChords(section.chords ?? section.Chords ?? []),
        })),
    };
}

function normalizeChords(chords: any[]) {
    if (!Array.isArray(chords)) return [];

    return chords.map((chord) => {
        if (chord && Array.isArray(chord.notes)) {
            return chord;
        }

        if (Array.isArray(chord)) {
            return {
                id: crypto.randomUUID(),
                notes: chord,
            };
        }

        return {
            id: crypto.randomUUID(),
            notes: [chord],
        };
    });
}

function getChordNoteCount(chord: any) {
    if (chord && Array.isArray(chord.notes)) {
        return chord.notes.length;
    }

    if (Array.isArray(chord)) {
        return chord.length;
    }

    return 0;
}

function makeSelectedWml(wml: any, selectedKeys: string[]) {
    return {
        ...wml,
        sections: wml.sections.map((section: any, sectionIndex: number) => ({
            ...section,
            chords: section.chords.filter((_chord: any, chordIndex: number) =>
                selectedKeys.includes(getChordKey(sectionIndex, chordIndex))
            ),
        })),
    };
}

function downloadTextFile(text: string, filename: string) {
    const blob = new Blob([text], {
        type: "text/plain;charset=utf-8",
    });

    downloadBlob(blob, filename);
}

function downloadMidiFile(midi: any, filename: string) {
    const data = midi.toArray();

    const blob = new Blob([data], {
        type: "audio/midi",
    });

    downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

function getSafeFileName(filename: string) {
    return filename.replace(/[\\/:*?"<>|]/g, "_");
}

function getInstrumentLabel(instrumentId: string | undefined) {
    const id = instrumentId ?? DEFAULT_INSTRUMENT_ID;
    return INSTRUMENT_LABELS[id] ?? id;
}