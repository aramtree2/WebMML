import { useEffect, useMemo, useRef, useState } from "react";
import { playbackEngine, secondsToTick, tickToSeconds } from "../../../core/playback";
import { getWmlProject, subscribeWmlProject } from "../../../core/wml/wmlStore";
import { wmlProjectToPianoRollData } from "./pianoRollMapper";
import "./PianoRollPanel.css";

const MIN_NOTE = 12; // C0
const MAX_NOTE = 119; // B8

const BASE_ROW_HEIGHT = 22;
const BASE_BEAT_WIDTH = 64;

const KEYBOARD_WIDTH = 72;
const HEADER_HEIGHT = 28;
const DEFAULT_VISIBLE_BEAT_COUNT = 32;

const AUTO_SCROLL_RIGHT_RATIO = 0.75;
const AUTO_SCROLL_LEFT_RATIO = 0.15;

type PianoRollRow = {
    midi: number;
    name: string;
    isBlack: boolean;
};

type PianoWhiteKey = {
    midi: number;
    name: string;
    top: number;
    height: number;
    labelPosition: WhiteKeyLabelPosition;
};

type WhiteKeyLabelPosition = "top" | "center" | "bottom";

export function PianoRollPanel() {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);

    const [project, setProject] = useState(() => getWmlProject());
    const [playbackSnapshot, setPlaybackSnapshot] = useState(() => playbackEngine.getSnapshot());

    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [zoomX, setZoomX] = useState(1);
    const [zoomY, setZoomY] = useState(1);

    const rows = useMemo(() => createNoteRows(), []);
    const pianoRollData = useMemo(() => wmlProjectToPianoRollData(project), [project]);

    const rowHeight = BASE_ROW_HEIGHT * zoomY;
    const beatWidth = BASE_BEAT_WIDTH * zoomX;
    const ticksPerBeat = pianoRollData.ticksPerBeat;

    const currentTick = secondsToTick(playbackSnapshot.currentTime, project.tempos);
    const playheadLeft = tickToX(currentTick, ticksPerBeat, beatWidth);

    const totalBeatCount = Math.max(
        DEFAULT_VISIBLE_BEAT_COUNT,
        pianoRollData.beatCount,
        Math.ceil(playbackSnapshot.durationTick / ticksPerBeat) + 4,
    );

    const contentWidth = totalBeatCount * beatWidth;
    const contentHeight = rows.length * rowHeight;
    const whiteKeys = createWhiteKeys(rows, rowHeight, contentHeight);

    const syncScrollState = () => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        setScrollLeft(scrollArea.scrollLeft);
        setScrollTop(scrollArea.scrollTop);
    };

    useEffect(() => {
        return subscribeWmlProject((nextProject) => {
            setProject(nextProject);
        });
    }, []);

    useEffect(() => {
        return playbackEngine.subscribe((snapshot) => {
            setPlaybackSnapshot(snapshot);
        });
    }, []);

    useEffect(() => {
        if (playbackSnapshot.state !== "playing") return;

        let animationFrameId = 0;

        const updatePlayhead = () => {
            setPlaybackSnapshot(playbackEngine.getSnapshot());
            animationFrameId = window.requestAnimationFrame(updatePlayhead);
        };

        animationFrameId = window.requestAnimationFrame(updatePlayhead);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [playbackSnapshot.state]);

    useEffect(() => {
        if (playbackSnapshot.state !== "playing") return;

        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const visibleWidth = scrollArea.clientWidth;
        if (visibleWidth <= 0) return;

        const leftBoundary = scrollArea.scrollLeft + visibleWidth * AUTO_SCROLL_LEFT_RATIO;
        const rightBoundary = scrollArea.scrollLeft + visibleWidth * AUTO_SCROLL_RIGHT_RATIO;

        let nextScrollLeft: number | null = null;

        if (playheadLeft > rightBoundary) {
            nextScrollLeft = playheadLeft - visibleWidth * 0.35;
        } else if (playheadLeft < leftBoundary) {
            nextScrollLeft = playheadLeft - visibleWidth * 0.2;
        }

        if (nextScrollLeft == null) return;

        const maxScrollLeft = Math.max(0, scrollArea.scrollWidth - visibleWidth);
        scrollArea.scrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
        syncScrollState();
    }, [playbackSnapshot.state, playheadLeft]);

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        const handleWheel = (e: WheelEvent) => {
            const scrollArea = scrollAreaRef.current;
            if (!scrollArea) return;

            const target = e.target;
            if (!(target instanceof Element)) return;

            const isKeyboardWheel = target.closest(".piano-roll-keyboard") != null;
            const isGridWheel = target.closest(".piano-roll-scroll-area") != null;

            e.preventDefault();
            e.stopPropagation();

            if (isKeyboardWheel) {
                if (e.ctrlKey) {
                    setZoomY((prev) => clamp(prev - e.deltaY * 0.002, 0.5, 3));
                    return;
                }

                scrollArea.scrollTop += e.deltaY;
                syncScrollState();
                return;
            }

            if (isGridWheel) {
                if (e.ctrlKey) {
                    setZoomX((prev) => clamp(prev - e.deltaY * 0.002, 0.5, 4));
                    return;
                }

                scrollArea.scrollLeft += e.deltaY + e.deltaX;
                syncScrollState();
            }
        };

        panel.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            panel.removeEventListener("wheel", handleWheel);
        };
    }, []);

    const handleTimeHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;

        const header = e.currentTarget;
        const rect = header.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;
        const tick = xToTick(x, ticksPerBeat, beatWidth);
        const seconds = tickToSeconds(tick, project.tempos);

        playbackEngine.seek(seconds);
        setPlaybackSnapshot(playbackEngine.getSnapshot());
    };

    return (
        <div ref={panelRef} className="panel-content piano-roll-panel">
            <div
                className="piano-roll-corner"
                style={{
                    width: KEYBOARD_WIDTH,
                    height: HEADER_HEIGHT,
                }}
            />

            <div
                className="piano-roll-time-header"
                style={{
                    left: KEYBOARD_WIDTH,
                    height: HEADER_HEIGHT,
                }}
                onPointerDown={handleTimeHeaderPointerDown}
            >
                <div
                    className="piano-roll-time-content"
                    style={{
                        width: contentWidth,
                        transform: `translateX(${-scrollLeft}px)`,
                    }}
                >
                    {Array.from({ length: totalBeatCount + 1 }, (_, beat) => (
                        <div
                            key={beat}
                            className={
                                beat % 4 === 0
                                    ? "piano-roll-beat-label measure-label"
                                    : "piano-roll-beat-label"
                            }
                            style={{
                                left: beat * beatWidth,
                                width: beatWidth,
                            }}
                        >
                            {beat + 1}
                        </div>
                    ))}

                    <div
                        className="piano-roll-playhead-header"
                        style={{ left: playheadLeft }}
                    />
                </div>
            </div>

            <div className="piano-roll-body" style={{ top: HEADER_HEIGHT }}>
                <div
                    className="piano-roll-keyboard"
                    style={{ width: KEYBOARD_WIDTH }}
                >
                    <div
                        className="piano-roll-keyboard-content"
                        style={{
                            height: contentHeight,
                            transform: `translateY(${-scrollTop}px)`,
                        }}
                    >
                        {whiteKeys.map((key) => (
                            <div
                                key={key.midi}
                                className="piano-roll-white-key"
                                style={{
                                    top: key.top,
                                    height: key.height,
                                }}
                            >
                                <span
                                    className={`piano-roll-white-key-label ${key.labelPosition}`}
                                >
                                    {key.name}
                                </span>
                            </div>
                        ))}

                        {rows
                            .filter((row) => row.isBlack)
                            .map((row) => {
                                const y = noteToY(row.midi, rows, rowHeight);
                                if (y == null) return null;

                                return (
                                    <div
                                        key={row.midi}
                                        className="piano-roll-black-key"
                                        style={{
                                            top: y,
                                            height: rowHeight,
                                        }}
                                    />
                                );
                            })}
                    </div>
                </div>

                <div
                    ref={scrollAreaRef}
                    className="piano-roll-scroll-area"
                    onScroll={syncScrollState}
                >
                    <div
                        className="piano-roll-grid"
                        style={{
                            width: contentWidth,
                            height: contentHeight,
                        }}
                    >
                        {rows.map((row, index) => (
                            <div
                                key={row.midi}
                                className={
                                    row.isBlack
                                        ? "piano-roll-row black-row"
                                        : "piano-roll-row white-row"
                                }
                                style={{
                                    top: index * rowHeight,
                                    height: rowHeight,
                                }}
                            />
                        ))}

                        {Array.from({ length: totalBeatCount + 1 }, (_, beat) => (
                            <div
                                key={beat}
                                className={
                                    beat % 4 === 0
                                        ? "piano-roll-grid-line measure-line"
                                        : "piano-roll-grid-line beat-line"
                                }
                                style={{ left: beat * beatWidth }}
                            />
                        ))}

                        {pianoRollData.notes.map((note) => {
                            const y = noteToY(note.midi, rows, rowHeight);
                            if (y == null) return null;

                            return (
                                <div
                                    key={note.id}
                                    className="piano-roll-note"
                                    data-note-id={note.id}
                                    style={{
                                        left: tickToX(note.startTick, ticksPerBeat, beatWidth),
                                        top: y + 2,
                                        width: Math.max(
                                            tickToWidth(note.durationTick, ticksPerBeat, beatWidth) - 4,
                                            4,
                                        ),
                                        height: Math.max(rowHeight - 4, 4),
                                    }}
                                    title={`${midiToName(note.midi)} / ${note.startTick}`}
                                />
                            );
                        })}

                        <div
                            className="piano-roll-playhead"
                            style={{ left: playheadLeft }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function tickToX(tick: number, ticksPerBeat: number, beatWidth: number) {
    return tick / ticksPerBeat * beatWidth;
}

function tickToWidth(tick: number, ticksPerBeat: number, beatWidth: number) {
    return tickToX(tick, ticksPerBeat, beatWidth);
}

function xToTick(x: number, ticksPerBeat: number, beatWidth: number) {
    return Math.max(0, x / beatWidth * ticksPerBeat);
}

function createNoteRows(): PianoRollRow[] {
    const rows: PianoRollRow[] = [];

    for (let midi = MAX_NOTE; midi >= MIN_NOTE; midi--) {
        rows.push({
            midi,
            name: midiToName(midi),
            isBlack: isBlackKey(midi),
        });
    }

    return rows;
}

function createWhiteKeys(
    rows: PianoRollRow[],
    rowHeight: number,
    contentHeight: number,
): PianoWhiteKey[] {
    const whiteRows = rows.filter((row) => !row.isBlack);

    return whiteRows.map((row, index) => {
        const centerY = getNoteCenterY(row.midi, rows, rowHeight);
        const prevCenterY =
            index > 0
                ? getNoteCenterY(whiteRows[index - 1].midi, rows, rowHeight)
                : null;
        const nextCenterY =
            index < whiteRows.length - 1
                ? getNoteCenterY(whiteRows[index + 1].midi, rows, rowHeight)
                : null;

        const top = prevCenterY == null ? 0 : (prevCenterY + centerY) / 2;
        const bottom = nextCenterY == null ? contentHeight : (nextCenterY + centerY) / 2;

        return {
            midi: row.midi,
            name: row.name,
            top,
            height: bottom - top,
            labelPosition: getWhiteKeyLabelPosition(row.midi),
        };
    });
}

function getWhiteKeyLabelPosition(midi: number): WhiteKeyLabelPosition {
    const pitchClass = midi % 12;

    // 세로 피아노 기준.
    // B/E는 아래쪽에 검은건반이 붙으므로 위쪽에 배치.
    // C/F는 위쪽에 검은건반이 붙으므로 아래쪽에 배치.
    // D/G/A는 검은건반 사이 중앙 여백에 배치.
    switch (pitchClass) {
        case 11: // B
        case 4: // E
            return "top";
        case 0: // C
        case 5: // F
            return "bottom";
        default: // D, G, A
            return "center";
    }
}

function getNoteCenterY(midi: number, rows: PianoRollRow[], rowHeight: number) {
    const y = noteToY(midi, rows, rowHeight);
    return (y ?? 0) + rowHeight / 2;
}

function noteToY(midi: number, rows: PianoRollRow[], rowHeight: number) {
    const index = rows.findIndex((row) => row.midi === midi);
    if (index < 0) return null;

    return index * rowHeight;
}

function midiToName(midi: number) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const name = names[midi % 12];
    const octave = Math.floor(midi / 12) - 1;

    return `${name}${octave}`;
}

function isBlackKey(midi: number) {
    return [1, 3, 6, 8, 10].includes(midi % 12);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
