import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from "react";
import type { Chord, WmlProject } from "../../../core/wml/wmlTypes";
import {
    getWmlProject,
    subscribeWmlProject,
    updateWmlProject,
} from "../../../core/wml/wmlStore";
import {
    createEmptyChord,
    createEmptySection,
    renameSection,
} from "../../../core/wml/wmlUtils";
import {
    getArrangementSelection,
    getChordControl,
    getSectionControl,
    selectChord,
    selectSection,
    subscribeArrangementControlState,
    toggleChordMute,
    toggleChordSoloInSection,
    toggleChordVisible,
    toggleSectionMuteGroup,
    toggleSectionSoloGroup,
    toggleSectionVisible,
} from "../../../core/editor/arrangementControlStore";
import {
    DEFAULT_INSTRUMENT_ID,
    getAllInstrumentDefs,
} from "../../../core/virtualInstrument/instrumentRegistry";

type DragItem =
    | {
          type: "section";
          sectionId: string;
      }
    | {
          type: "chord";
          sectionId: string;
          chordId: string;
      };

type ContextMenuState =
    | {
          type: "section";
          sectionId: string;
          x: number;
          y: number;
      }
    | {
          type: "chord";
          sectionId: string;
          chordId: string;
          x: number;
          y: number;
      };

export function InstrumentPanel() {
    const [project, setProject] = useState<WmlProject>(() => getWmlProject());
    const [, setControlVersion] = useState(0);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
    const [dragItem, setDragItem] = useState<DragItem | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingSectionName, setEditingSectionName] = useState("");

    const instrumentDefs = useMemo(() => getAllInstrumentDefs(), []);
    const selection = getArrangementSelection();
    const sectionScopes = project.sections.map((section) => ({
        sectionId: section.id,
        chordIds: section.chords.map((chord) => chord.id),
    }));

    useEffect(() => {
        const unsubscribeWml = subscribeWmlProject((nextProject) => {
            setProject(nextProject);
        });

        const unsubscribeControl = subscribeArrangementControlState(() => {
            setControlVersion((v) => v + 1);
        });

        return () => {
            unsubscribeWml();
            unsubscribeControl();
        };
    }, []);

    useEffect(() => {
        if (!contextMenu) return;

        const closeContextMenu = () => setContextMenu(null);
        const closeContextMenuByEscape = (e: globalThis.KeyboardEvent) => {
            if (e.key === "Escape") {
                setContextMenu(null);
            }
        };

        window.addEventListener("click", closeContextMenu);
        window.addEventListener("contextmenu", closeContextMenu);
        window.addEventListener("keydown", closeContextMenuByEscape);

        return () => {
            window.removeEventListener("click", closeContextMenu);
            window.removeEventListener("contextmenu", closeContextMenu);
            window.removeEventListener("keydown", closeContextMenuByEscape);
        };
    }, [contextMenu]);

    const toggleCollapsed = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    const startEditSectionName = (sectionId: string, sectionName: string) => {
        setContextMenu(null);
        setEditingSectionId(sectionId);
        setEditingSectionName(sectionName);
    };

    const commitEditSectionName = () => {
        if (!editingSectionId) return;

        const nextName = editingSectionName.trim();

        if (nextName) {
            updateWmlProject((p) => renameSection(p, editingSectionId, nextName));
        }

        setEditingSectionId(null);
        setEditingSectionName("");
    };

    const cancelEditSectionName = () => {
        setEditingSectionId(null);
        setEditingSectionName("");
    };

    const handleEditSectionNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitEditSectionName();
        } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEditSectionName();
        }
    };

    const openSectionContextMenu = (e: MouseEvent<HTMLElement>, sectionId: string) => {
        e.preventDefault();
        e.stopPropagation();

        setContextMenu({
            type: "section",
            sectionId,
            x: e.clientX,
            y: e.clientY,
        });
    };

    const openChordContextMenu = (
        e: MouseEvent<HTMLElement>,
        sectionId: string,
        chordId: string
    ) => {
        e.preventDefault();
        e.stopPropagation();

        setContextMenu({
            type: "chord",
            sectionId,
            chordId,
            x: e.clientX,
            y: e.clientY,
        });
    };

    const addSection = () => {
        updateWmlProject((p) => ({
            ...p,
            sections: [...p.sections, createEmptySection(p.sections.length)],
        }));
    };

    const addChord = (sectionId: string) => {
        updateWmlProject((p) => ({
            ...p,
            sections: p.sections.map((section) =>
                section.id === sectionId
                    ? {
                          ...section,
                          chords: [...section.chords, createEmptyChord()],
                      }
                    : section
            ),
        }));
    };

    const deleteSection = (sectionId: string) => {
        updateWmlProject((p) => ({
            ...p,
            sections: p.sections.filter((section) => section.id !== sectionId),
        }));

        setCollapsedSections((prev) => {
            const next = { ...prev };
            delete next[sectionId];
            return next;
        });

        if (editingSectionId === sectionId) {
            cancelEditSectionName();
        }
    };

    const deleteChord = (sectionId: string, chordId: string) => {
        updateWmlProject((p) => ({
            ...p,
            sections: p.sections.map((section) =>
                section.id === sectionId
                    ? {
                          ...section,
                          chords: section.chords.filter((chord) => chord.id !== chordId),
                      }
                    : section
            ),
        }));
    };

    const changeSectionInstrument = (sectionId: string, instrumentId: string) => {
        updateWmlProject((p) => ({
            ...p,
            sections: p.sections.map((section) =>
                section.id === sectionId
                    ? {
                          ...section,
                          instrument: instrumentId,
                      }
                    : section
            ),
        }));
    };

    const moveSectionBefore = (targetSectionId: string) => {
        if (!dragItem || dragItem.type !== "section") return;
        if (dragItem.sectionId === targetSectionId) return;

        updateWmlProject((p) => {
            const sections = [...p.sections];
            const fromIndex = sections.findIndex((section) => section.id === dragItem.sectionId);
            const toIndex = sections.findIndex((section) => section.id === targetSectionId);

            if (fromIndex < 0 || toIndex < 0) return p;

            const [movedSection] = sections.splice(fromIndex, 1);
            const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
            sections.splice(adjustedToIndex, 0, movedSection);

            return {
                ...p,
                sections,
            };
        });
    };

    const moveSectionToEnd = () => {
        if (!dragItem || dragItem.type !== "section") return;

        updateWmlProject((p) => {
            const sections = [...p.sections];
            const fromIndex = sections.findIndex((section) => section.id === dragItem.sectionId);

            if (fromIndex < 0 || fromIndex === sections.length - 1) return p;

            const [movedSection] = sections.splice(fromIndex, 1);
            sections.push(movedSection);

            return {
                ...p,
                sections,
            };
        });
    };

    const moveChord = (targetSectionId: string, targetChordId?: string) => {
        if (!dragItem || dragItem.type !== "chord") return;
        if (dragItem.sectionId === targetSectionId && dragItem.chordId === targetChordId) return;

        updateWmlProject((p) => {
            let movedChord: Chord | null = null;

            const sectionsWithoutMovedChord = p.sections.map((section) => {
                if (section.id !== dragItem.sectionId) return section;

                const nextChords = section.chords.filter((chord) => {
                    if (chord.id === dragItem.chordId) {
                        movedChord = chord;
                        return false;
                    }

                    return true;
                });

                return {
                    ...section,
                    chords: nextChords,
                };
            });

            if (!movedChord) return p;

            const nextSections = sectionsWithoutMovedChord.map((section) => {
                if (section.id !== targetSectionId) return section;

                const nextChords = [...section.chords];

                if (!targetChordId) {
                    nextChords.push(movedChord!);
                } else {
                    const targetIndex = nextChords.findIndex((chord) => chord.id === targetChordId);
                    const insertIndex = targetIndex < 0 ? nextChords.length : targetIndex;
                    nextChords.splice(insertIndex, 0, movedChord!);
                }

                return {
                    ...section,
                    chords: nextChords,
                };
            });

            return {
                ...p,
                sections: nextSections,
            };
        });
    };

    const finishDrop = () => {
        setDragItem(null);
    };

    const allowDrop = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const runContextMenuAction = (action: () => void) => {
        action();
        closeContextMenu();
    };

    return (
        <div className="panel-content" style={styles.root} onContextMenu={(e) => e.preventDefault()}>
            <div
                style={styles.list}
                onDragOver={allowDrop}
                onDrop={(e) => {
                    e.preventDefault();

                    if (dragItem?.type === "section") {
                        moveSectionToEnd();
                    }

                    finishDrop();
                }}
            >
                {project.sections.length === 0 && (
                    <div style={styles.empty}>섹션이 없습니다.</div>
                )}

                {project.sections.map((section, sectionIndex) => {
                    const chordIds = section.chords.map((chord) => chord.id);
                    const sectionControl = getSectionControl(section.id, chordIds);
                    const collapsed = collapsedSections[section.id] ?? false;
                    const sectionInstrument = section.instrument || DEFAULT_INSTRUMENT_ID;
                    const sectionName = section.name || `Section ${sectionIndex + 1}`;
                    const sectionSelected = selection.selectedSectionId === section.id;

                    return (
                        <section
                            key={section.id}
                            style={{
                                ...styles.sectionCard,
                                ...(sectionSelected ? styles.sectionCardSelected : null),
                            }}
                            onContextMenu={(e) => openSectionContextMenu(e, section.id)}
                            onDragOver={allowDrop}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                if (dragItem?.type === "section") {
                                    moveSectionBefore(section.id);
                                } else if (dragItem?.type === "chord") {
                                    moveChord(section.id);
                                }

                                finishDrop();
                            }}
                        >
                            <SectionHeader
                                sectionName={sectionName}
                                isEditingName={editingSectionId === section.id}
                                editingName={editingSectionName}
                                collapsed={collapsed}
                                sectionInstrument={sectionInstrument}
                                instrumentDefs={instrumentDefs}
                                control={sectionControl}
                                selected={sectionSelected}
                                onSelect={() => selectSection(section.id)}
                                onStartEditName={() => startEditSectionName(section.id, sectionName)}
                                onEditingNameChange={setEditingSectionName}
                                onCommitEditName={commitEditSectionName}
                                onCancelEditName={cancelEditSectionName}
                                onEditNameKeyDown={handleEditSectionNameKeyDown}
                                onToggleCollapsed={() => toggleCollapsed(section.id)}
                                onChangeInstrument={(instrumentId) =>
                                    changeSectionInstrument(section.id, instrumentId)
                                }
                                onDragStart={(e) => {
                                    e.stopPropagation();
                                    setDragItem({
                                        type: "section",
                                        sectionId: section.id,
                                    });
                                }}
                                onDragEnd={finishDrop}
                                onVisible={() => toggleSectionVisible(section.id, chordIds)}
                                onSolo={() => toggleSectionSoloGroup(section.id, sectionScopes)}
                                onMute={() => toggleSectionMuteGroup({ sectionId: section.id, chordIds })}
                            />

                            {!collapsed && (
                                <div
                                    style={styles.chordList}
                                    onDragOver={allowDrop}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();

                                        if (dragItem?.type === "chord") {
                                            moveChord(section.id);
                                        }

                                        finishDrop();
                                    }}
                                >
                                    {section.chords.length === 0 && (
                                        <div style={styles.emptyChordList}>
                                            우클릭해서 화음을 추가할 수 있습니다.
                                        </div>
                                    )}

                                    {section.chords.map((chord, chordIndex) => {
                                        const chordControl = getChordControl(chord.id);
                                        const chordSelected =
                                            selection.selectedChordId === chord.id;

                                        return (
                                            <ChordRow
                                                key={chord.id}
                                                chordIndex={chordIndex}
                                                noteCount={chord.notes.length}
                                                control={chordControl}
                                                selected={chordSelected}
                                                onSelect={() => selectChord(section.id, chord.id)}
                                                onContextMenu={(e) =>
                                                    openChordContextMenu(e, section.id, chord.id)
                                                }
                                                onDragStart={(e) => {
                                                    e.stopPropagation();
                                                    setDragItem({
                                                        type: "chord",
                                                        sectionId: section.id,
                                                        chordId: chord.id,
                                                    });
                                                }}
                                                onDragEnd={finishDrop}
                                                onDragOver={allowDrop}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();

                                                    if (dragItem?.type === "chord") {
                                                        moveChord(section.id, chord.id);
                                                    }

                                                    finishDrop();
                                                }}
                                                onVisible={() => toggleChordVisible(chord.id)}
                                                onSolo={() =>
                                                    toggleChordSoloInSection(
                                                        section.id,
                                                        chord.id,
                                                        chordIds,
                                                    )
                                                }
                                                onMute={() => toggleChordMute(chord.id)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    );
                })}

                <button type="button" style={styles.addSectionButton} onClick={addSection}>
                    + 섹션 추가
                </button>
            </div>

            {contextMenu && (
                <ContextMenu
                    state={contextMenu}
                    onAddChord={(sectionId) => runContextMenuAction(() => addChord(sectionId))}
                    onDeleteSection={(sectionId) =>
                        runContextMenuAction(() => deleteSection(sectionId))
                    }
                    onDeleteChord={(sectionId, chordId) =>
                        runContextMenuAction(() => deleteChord(sectionId, chordId))
                    }
                />
            )}
        </div>
    );
}

type ControlState = {
    visible: boolean;
    solo: boolean;
    mute: boolean;
};

type SectionHeaderProps = {
    sectionName: string;
    isEditingName: boolean;
    editingName: string;
    collapsed: boolean;
    sectionInstrument: string;
    instrumentDefs: Array<{ id: string; name: string }>;
    control: ControlState;
    selected: boolean;
    onSelect: () => void;
    onStartEditName: () => void;
    onEditingNameChange: (name: string) => void;
    onCommitEditName: () => void;
    onCancelEditName: () => void;
    onEditNameKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
    onToggleCollapsed: () => void;
    onChangeInstrument: (instrumentId: string) => void;
    onDragStart: (e: DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
    onVisible: () => void;
    onSolo: () => void;
    onMute: () => void;
};

function SectionHeader({
    sectionName,
    isEditingName,
    editingName,
    collapsed,
    sectionInstrument,
    instrumentDefs,
    control,
    selected,
    onSelect,
    onStartEditName,
    onEditingNameChange,
    onCommitEditName,
    onEditNameKeyDown,
    onToggleCollapsed,
    onChangeInstrument,
    onDragStart,
    onDragEnd,
    onVisible,
    onSolo,
    onMute,
}: SectionHeaderProps) {
    return (
        <div
            style={{
                ...styles.sectionHeader,
                ...(selected ? styles.sectionHeaderSelected : null),
            }}
            onClick={onSelect}
        >
            <button
                type="button"
                style={styles.collapseButton}
                onClick={onToggleCollapsed}
                title={collapsed ? "펼치기" : "접기"}
            >
                {collapsed ? "▶" : "▼"}
            </button>

            <div
                style={styles.sectionDragHandle}
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                title="섹션 순서 변경"
            >
                ⋮⋮
            </div>

            {isEditingName ? (
                <input
                    style={styles.sectionNameInput}
                    value={editingName}
                    autoFocus
                    onChange={(e) => onEditingNameChange(e.target.value)}
                    onBlur={onCommitEditName}
                    onKeyDown={onEditNameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    title="Enter 저장 / Escape 취소"
                />
            ) : (
                <div
                    style={styles.sectionName}
                    title="더블클릭해서 이름 변경"
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        onStartEditName();
                    }}
                >
                    {sectionName}
                </div>
            )}

            <select
                style={styles.instrumentSelect}
                value={sectionInstrument}
                onChange={(e) => onChangeInstrument(e.target.value)}
                title="악기 선택"
            >
                {instrumentDefs.map((def) => (
                    <option key={def.id} value={def.id}>
                        {def.name}
                    </option>
                ))}
            </select>

            <ControlButtons
                visible={control.visible}
                solo={control.solo}
                mute={control.mute}
                onVisible={onVisible}
                onSolo={onSolo}
                onMute={onMute}
            />
        </div>
    );
}

type ChordRowProps = {
    chordIndex: number;
    noteCount: number;
    control: ControlState;
    selected: boolean;
    onSelect: () => void;
    onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
    onDragStart: (e: DragEvent<HTMLDivElement>) => void;
    onDragEnd: () => void;
    onDragOver: (e: DragEvent<HTMLDivElement>) => void;
    onDrop: (e: DragEvent<HTMLDivElement>) => void;
    onVisible: () => void;
    onSolo: () => void;
    onMute: () => void;
};

function ChordRow({
    chordIndex,
    noteCount,
    control,
    selected,
    onSelect,
    onContextMenu,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
    onVisible,
    onSolo,
    onMute,
}: ChordRowProps) {
    return (
        <div
            style={{
                ...styles.chordRow,
                ...(selected ? styles.chordRowSelected : null),
            }}
            onClick={onSelect}
            onContextMenu={onContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            <div
                style={styles.chordDragHandle}
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                title="화음 순서 변경 / 다른 섹션으로 이동"
            >
                ⋮⋮
            </div>

            <div style={styles.chordName}>
                화음 {chordIndex + 1}
                <span style={styles.noteCount}>{noteCount} notes</span>
            </div>

            <ControlButtons
                visible={control.visible}
                solo={control.solo}
                mute={control.mute}
                onVisible={onVisible}
                onSolo={onSolo}
                onMute={onMute}
            />
        </div>
    );
}

type ControlButtonsProps = {
    visible: boolean;
    solo: boolean;
    mute: boolean;
    onVisible: () => void;
    onSolo: () => void;
    onMute: () => void;
};

function ControlButtons({
    visible,
    solo,
    mute,
    onVisible,
    onSolo,
    onMute,
}: ControlButtonsProps) {
    return (
        <div style={styles.controls} onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                style={{
                    ...styles.controlButton,
                    opacity: visible ? 1 : 0.35,
                }}
                onClick={onVisible}
                title={visible ? "숨기기" : "보이기"}
            >
                👁
            </button>

            <button
                type="button"
                style={{
                    ...styles.controlButton,
                    ...(solo ? styles.soloActive : null),
                }}
                onClick={onSolo}
                title="솔로"
            >
                S
            </button>

            <button
                type="button"
                style={{
                    ...styles.controlButton,
                    ...(mute ? styles.muteActive : null),
                }}
                onClick={onMute}
                title="뮤트"
            >
                M
            </button>
        </div>
    );
}

type ContextMenuProps = {
    state: ContextMenuState;
    onAddChord: (sectionId: string) => void;
    onDeleteSection: (sectionId: string) => void;
    onDeleteChord: (sectionId: string, chordId: string) => void;
};

function ContextMenu({
    state,
    onAddChord,
    onDeleteSection,
    onDeleteChord,
}: ContextMenuProps) {
    return (
        <div
            style={{
                ...styles.contextMenu,
                left: state.x,
                top: state.y,
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {state.type === "section" ? (
                <>
                    <button
                        type="button"
                        style={styles.contextMenuItem}
                        onClick={() => onAddChord(state.sectionId)}
                    >
                        화음 추가
                    </button>
                    <button
                        type="button"
                        style={{ ...styles.contextMenuItem, ...styles.dangerMenuItem }}
                        onClick={() => onDeleteSection(state.sectionId)}
                    >
                        섹션 삭제
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    style={{ ...styles.contextMenuItem, ...styles.dangerMenuItem }}
                    onClick={() => onDeleteChord(state.sectionId, state.chordId)}
                >
                    화음 삭제
                </button>
            )}
        </div>
    );
}

const styles: Record<string, CSSProperties> = {
    root: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        height: "100%",
        padding: "10px",
        boxSizing: "border-box",
        fontSize: "13px",
        color: "#111827",
    },
    list: {
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        paddingRight: "2px",
    },
    empty: {
        opacity: 0.6,
        padding: "12px",
        textAlign: "center",
        border: "1px dashed #cfcfcf",
        borderRadius: "6px",
        background: "#ffffff",
    },
    emptyChordList: {
        padding: "12px 10px",
        color: "#9ca3af",
        fontSize: "12px",
        textAlign: "center",
        borderTop: "1px solid #eeeeee",
    },
    sectionCard: {
        flex: "0 0 auto",
        minWidth: 0,
        border: "1px solid #cfcfcf",
        borderColor: "#cfcfcf",
        borderRadius: "6px",
        background: "#ffffff",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    },
    sectionCardSelected: {
        borderColor: "#4d94cf",
        background: "#f7fbff",
        boxShadow: "0 0 0 1px rgba(77, 148, 207, 0.35)",
    },
    sectionHeader: {
        display: "grid",
        gridTemplateColumns: "22px 18px minmax(80px, 1fr) minmax(110px, 160px) auto",
        alignItems: "center",
        gap: "6px",
        minWidth: 0,
        padding: "10px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fafafa",
        cursor: "pointer",
    },
    sectionHeaderSelected: {
        background: "#e8f0ff",
        boxShadow: "inset 3px 0 0 #2563eb",
    },
    collapseButton: {
        width: "22px",
        height: "24px",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: 0,
        fontSize: "13px",
    },
    sectionDragHandle: {
        cursor: "grab",
        opacity: 0.45,
        userSelect: "none",
        fontSize: "14px",
        lineHeight: "16px",
    },
    sectionName: {
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 700,
        cursor: "text",
    },
    sectionNameInput: {
        minWidth: 0,
        width: "100%",
        height: "26px",
        boxSizing: "border-box",
        border: "1px solid #93c5fd",
        borderRadius: "4px",
        background: "#ffffff",
        color: "inherit",
        padding: "0 6px",
        fontWeight: 700,
        outline: "none",
    },
    instrumentSelect: {
        minWidth: 0,
        width: "100%",
        height: "28px",
        border: "1px solid #cfd4dc",
        borderRadius: "4px",
        background: "#ffffff",
        padding: "0 6px",
        color: "inherit",
    },
    chordList: {
        display: "flex",
        flexDirection: "column",
        minHeight: "44px",
        background: "inherit",
    },
    chordRow: {
        display: "grid",
        gridTemplateColumns: "28px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "6px",
        minWidth: 0,
        padding: "9px 10px",
        borderBottom: "1px solid #eeeeee",
        background: "inherit",
        cursor: "pointer",
    },
    chordRowSelected: {
        background: "#fff7e8",
        boxShadow: "inset 3px 0 0 #f59e0b",
    },
    chordDragHandle: {
        cursor: "grab",
        opacity: 0.45,
        userSelect: "none",
        fontSize: "14px",
        lineHeight: "16px",
    },
    chordName: {
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    noteCount: {
        marginLeft: "8px",
        opacity: 0.45,
        fontSize: "12px",
    },
    controls: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flex: "0 0 auto",
    },
    controlButton: {
        width: "24px",
        height: "24px",
        border: "none",
        borderRadius: "4px",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: 0,
        fontWeight: 700,
        fontSize: "13px",
    },
    soloActive: {
        background: "#dbe7ff",
    },
    muteActive: {
        background: "#ffdada",
    },
    addSectionButton: {
        flex: "0 0 auto",
        height: "42px",
        border: "1px solid #cfcfcf",
        borderRadius: "6px",
        background: "#ffffff",
        cursor: "pointer",
        fontWeight: 700,
        color: "inherit",
    },
    contextMenu: {
        position: "fixed",
        zIndex: 10000,
        minWidth: "130px",
        padding: "4px",
        border: "1px solid #cfd4dc",
        borderRadius: "6px",
        background: "#ffffff",
        boxShadow: "0 8px 20px rgba(0, 0, 0, 0.16)",
    },
    contextMenuItem: {
        display: "block",
        width: "100%",
        height: "30px",
        border: "none",
        borderRadius: "4px",
        background: "transparent",
        color: "#111827",
        cursor: "pointer",
        padding: "0 10px",
        textAlign: "left",
        fontSize: "13px",
    },
    dangerMenuItem: {
        color: "#dc2626",
    },
};
