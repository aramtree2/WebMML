import { useEffect, useState } from "react";
import type { WmlProject } from "../../../core/wml/wmlTypes";
import { getWmlProject, subscribeWmlProject } from "../../../core/wml/wmlStore";
import {
    // getArrangementControlState,
    getChordControl,
    getSectionControl,
    subscribeArrangementControlState,
    toggleChordMute,
    toggleChordSolo,
    toggleChordVisible,
    toggleSectionMute,
    toggleSectionSolo,
    toggleSectionVisible,
} from "../../../core/editor/arrangementControlStore";

export function InstrumentPanel() {
    const [project, setProject] = useState<WmlProject>(() => getWmlProject());
    const [, setControlVersion] = useState(0);
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

    const toggleCollapsed = (sectionId: string) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    return (
        <div className="panel-content" style={styles.root}>
            <div style={styles.title}>악기 구성</div>

            <div style={styles.list}>
                {project.sections.length === 0 && (
                    <div style={styles.empty}>섹션이 없습니다.</div>
                )}

                {project.sections.map((section) => {
                    const sectionControl = getSectionControl(section.id);
                    const collapsed = collapsedSections[section.id] ?? false;

                    return (
                        <div key={section.id} style={styles.sectionBlock}>
                            <div style={styles.sectionRow}>
                                <button
                                    type="button"
                                    style={styles.collapseButton}
                                    onClick={() => toggleCollapsed(section.id)}
                                    title={collapsed ? "펼치기" : "접기"}
                                >
                                    {collapsed ? "▶" : "▼"}
                                </button>

                                <div style={styles.sectionName}>
                                    <span style={styles.sectionText}>{section.name}</span>
                                    <span style={styles.instrumentText}>
                                        악기 {section.instrument}
                                    </span>
                                </div>

                                <ControlButtons
                                    visible={sectionControl.visible}
                                    solo={sectionControl.solo}
                                    mute={sectionControl.mute}
                                    onVisible={() => toggleSectionVisible(section.id)}
                                    onSolo={() => toggleSectionSolo(section.id)}
                                    onMute={() => toggleSectionMute(section.id)}
                                />
                            </div>

                            {!collapsed && (
                                <div style={styles.chordList}>
                                    {section.chords.map((chord, index) => {
                                        const chordControl = getChordControl(chord.id);

                                        return (
                                            <div key={chord.id} style={styles.chordRow}>
                                                <div style={styles.chordName}>
                                                    Chord {index + 1}
                                                    <span style={styles.noteCount}>
                                                        {chord.notes.length} notes
                                                    </span>
                                                </div>

                                                <ControlButtons
                                                    visible={chordControl.visible}
                                                    solo={chordControl.solo}
                                                    mute={chordControl.mute}
                                                    onVisible={() => toggleChordVisible(chord.id)}
                                                    onSolo={() => toggleChordSolo(chord.id)}
                                                    onMute={() => toggleChordMute(chord.id)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
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
        <div style={styles.controls}>
            <button
                type="button"
                style={{
                    ...styles.iconButton,
                    opacity: visible ? 1 : 0.35,
                }}
                onClick={onVisible}
                title={visible ? "숨기기" : "보이기"}
            >
                {visible ? "👁" : "◌"}
            </button>

            <button
                type="button"
                style={{
                    ...styles.textButton,
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
                    ...styles.textButton,
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

const styles: Record<string, React.CSSProperties> = {
    root: {
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        height: "100%",
        padding: "8px",
        boxSizing: "border-box",
        fontSize: "12px",
    },
    title: {
        flex: "0 0 auto",
        fontWeight: 700,
        marginBottom: "8px",
    },
    list: {
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
    },
    empty: {
        opacity: 0.6,
        padding: "8px",
    },
    sectionBlock: {
        borderTop: "1px solid rgba(255, 255, 255, 0.12)",
        paddingTop: "4px",
        paddingBottom: "4px",
    },
    sectionRow: {
        display: "grid",
        gridTemplateColumns: "20px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "4px",
        minWidth: 0,
        padding: "4px 2px",
        borderRadius: "4px",
        background: "rgba(255, 255, 255, 0.04)",
    },
    collapseButton: {
        width: "20px",
        height: "20px",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: 0,
        fontSize: "11px",
    },
    sectionName: {
        minWidth: 0,
        display: "flex",
        alignItems: "baseline",
        gap: "4px",
    },
    sectionText: {
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: 600,
    },
    instrumentText: {
        flex: "0 0 auto",
        opacity: 0.55,
        fontSize: "11px",
    },
    chordList: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        paddingTop: "3px",
        paddingLeft: "20px",
    },
    chordRow: {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "4px",
        minWidth: 0,
        padding: "3px 2px",
        borderRadius: "4px",
    },
    chordName: {
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    noteCount: {
        marginLeft: "6px",
        opacity: 0.45,
        fontSize: "11px",
    },
    controls: {
        display: "flex",
        alignItems: "center",
        gap: "3px",
        flex: "0 0 auto",
    },
    iconButton: {
        width: "22px",
        height: "20px",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        borderRadius: "4px",
        background: "rgba(255, 255, 255, 0.05)",
        color: "inherit",
        cursor: "pointer",
        padding: 0,
        fontSize: "12px",
        lineHeight: "18px",
    },
    textButton: {
        width: "20px",
        height: "20px",
        border: "1px solid rgba(255, 255, 255, 0.16)",
        borderRadius: "4px",
        background: "rgba(255, 255, 255, 0.05)",
        color: "inherit",
        cursor: "pointer",
        padding: 0,
        fontSize: "11px",
        fontWeight: 700,
        lineHeight: "18px",
    },
    soloActive: {
        background: "rgba(120, 150, 255, 0.45)",
        borderColor: "rgba(120, 150, 255, 0.9)",
    },
    muteActive: {
        background: "rgba(255, 90, 90, 0.45)",
        borderColor: "rgba(255, 90, 90, 0.9)",
    },
};