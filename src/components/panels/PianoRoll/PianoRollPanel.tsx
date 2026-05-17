import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    getArrangementControlState,
    subscribeArrangementControlState,
} from "../../../core/editor/arrangementControlStore";
import { EventEditorFloatingWindow } from "../../eventEditor";
import type { EventEditorAnchor, EventEditorTarget } from "../../eventEditor";
import { playbackEngine, secondsToTick, tickToSeconds } from "../../../core/playback";
import { getWmlProject, subscribeWmlProject, updateWmlProject } from "../../../core/wml/wmlStore";
import { createId } from "../../../core/wml/wmlUtils";
import type { TimeSignatureEvent } from "../../../core/wml/wmlTypes";
import type { TempoEvent } from "../../../core/wml/wmlTypes";
import { wmlProjectToPianoRollData } from "./pianoRollMapper";
import type { PianoRollNoteView } from "./pianoRollMapper";
import "./PianoRollPanel.css";

const MIN_NOTE = 12; // C0
const MAX_NOTE = 119; // B8

const BASE_ROW_HEIGHT = 15;
const BASE_BEAT_WIDTH = 30;

const KEYBOARD_WIDTH = 72;
const HEADER_HEIGHT = 34;
const HEADER_LANE_HEIGHT = HEADER_HEIGHT / 2;
const TEMPO_MARKER_WIDTH = 7;
const DEFAULT_TIME_SIGNATURE = {
    bar: 0,
    numerator: 4,
    denominator: 4,
};
const DEFAULT_VISIBLE_BEAT_COUNT = 32;
const INITIAL_TIMELINE_BEAT_COUNT = 96;
const TIMELINE_EXTENSION_BEAT_COUNT = 64;
const TIMELINE_EXTENSION_THRESHOLD_RATIO = 0.75;
const MIN_TIMELINE_TRAILING_WIDTH = 900;
const TIMELINE_PRUNE_EXTRA_WIDTH = 2400;

const AUTO_SCROLL_RIGHT_RATIO = 0.75;
const AUTO_SCROLL_LEFT_RATIO = 0.15;

type PianoRollRow = {
    midi: number;
    name: string;
    isBlack: boolean;
};

type PianoWhiteKey = {
    midi: number;
    top: number;
    height: number;
};

type PianoRollMeasureView = {
    bar: number;
    startBeat: number;
    beatLength: number;
    numerator: number;
    denominator: number;
    showTimeSignature: boolean;
};

type PianoRollBeatView = {
    key: string;
    label: number;
    startBeat: number;
    beatLength: number;
    isMeasureStart: boolean;
};

const pianoRollViewState = {
    scrollLeft: 0,
    scrollTop: 0,
    zoomX: 1,
    zoomY: 1,
};

export function PianoRollPanel() {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const restoredViewStateRef = useRef(false);
    const focusedSelectionRef = useRef<string | null>(null);

    const [project, setProject] = useState(() => getWmlProject());
    const [arrangementControls, setArrangementControls] = useState(() =>
        getArrangementControlState(),
    );
    const [playbackSnapshot, setPlaybackSnapshot] = useState(() => playbackEngine.getSnapshot());

    const [scrollLeft, setScrollLeft] = useState(() => pianoRollViewState.scrollLeft);
    const [scrollTop, setScrollTop] = useState(() => pianoRollViewState.scrollTop);
    const [zoomX, setZoomX] = useState(() => pianoRollViewState.zoomX);
    const [zoomY, setZoomY] = useState(() => pianoRollViewState.zoomY);
    const [editorTarget, setEditorTarget] = useState<EventEditorTarget | null>(null);
    const [editorAnchor, setEditorAnchor] = useState<EventEditorAnchor | null>(null);
    const [editorBounds, setEditorBounds] = useState<{ width: number; height: number } | null>(
        null,
    );
    const [tempoPreviewTick, setTempoPreviewTick] = useState<number | null>(null);
    const [isTempoMarkerHovered, setIsTempoMarkerHovered] = useState(false);
    const [timelineBeatCount, setTimelineBeatCount] = useState(INITIAL_TIMELINE_BEAT_COUNT);

    const rows = useMemo(() => createNoteRows(), []);
    const pianoRollData = useMemo(
        () => wmlProjectToPianoRollData(project, arrangementControls),
        [project, arrangementControls],
    );
    const selectedSectionId = arrangementControls.selectedSectionId;
    const selectedChordId = arrangementControls.selectedChordId;

    const rowHeight = BASE_ROW_HEIGHT * zoomY;
    const beatWidth = BASE_BEAT_WIDTH * zoomX;
    const ticksPerBeat = pianoRollData.ticksPerBeat;

    const currentTick = secondsToTick(playbackSnapshot.currentTime, project.tempos);
    const playheadLeft = tickToX(currentTick, ticksPerBeat, beatWidth);
    const playbackEndLeft =
        playbackSnapshot.durationTick > 0
            ? tickToX(playbackSnapshot.durationTick, ticksPerBeat, beatWidth)
            : null;

    const baseBeatCount = Math.max(
        DEFAULT_VISIBLE_BEAT_COUNT,
        pianoRollData.beatCount,
        Math.ceil(playbackSnapshot.durationTick / ticksPerBeat) + 4,
    );
    const totalBeatCount = Math.max(baseBeatCount, timelineBeatCount);

    const measureViews = useMemo(
        () => createMeasureViews(project.timeSignatures, totalBeatCount),
        [project.timeSignatures, totalBeatCount],
    );
    const contentBeatCount = getMeasureViewEndBeat(measureViews) || totalBeatCount;
    const beatViews = useMemo(
        () => createBeatViews(measureViews, contentBeatCount),
        [measureViews, contentBeatCount],
    );

    const contentWidth = contentBeatCount * beatWidth;
    const contentHeight = rows.length * rowHeight;
    const whiteKeys = createWhiteKeys(rows, contentHeight);

    const syncScrollState = () => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        extendTimelineIfNeeded(scrollArea);
        pruneTimelineIfNeeded(scrollArea);
        updateScrollState(scrollArea.scrollLeft, scrollArea.scrollTop);
    };

    const ensureTimelineFillsViewport = () => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const minimumBeatCount = Math.ceil(
            (scrollArea.clientWidth + MIN_TIMELINE_TRAILING_WIDTH) / beatWidth,
        );

        setTimelineBeatCount((prev) => Math.max(prev, baseBeatCount, minimumBeatCount));
    };

    const extendTimelineIfNeeded = (scrollArea: HTMLDivElement) => {
        const remainingWidth =
            scrollArea.scrollWidth - scrollArea.clientWidth - scrollArea.scrollLeft;
        const thresholdWidth = scrollArea.clientWidth * TIMELINE_EXTENSION_THRESHOLD_RATIO;

        if (remainingWidth > thresholdWidth) return;

        setTimelineBeatCount((prev) =>
            Math.max(prev + TIMELINE_EXTENSION_BEAT_COUNT, baseBeatCount),
        );
    };

    const pruneTimelineIfNeeded = (scrollArea: HTMLDivElement) => {
        const neededWidth =
            scrollArea.scrollLeft + scrollArea.clientWidth + MIN_TIMELINE_TRAILING_WIDTH;
        const extraWidth = scrollArea.scrollWidth - neededWidth;

        if (extraWidth <= TIMELINE_PRUNE_EXTRA_WIDTH) return;

        const minimumBeatCount = Math.ceil(
            (scrollArea.clientWidth + MIN_TIMELINE_TRAILING_WIDTH) / beatWidth,
        );
        const neededBeatCount = Math.ceil(neededWidth / beatWidth);

        setTimelineBeatCount((prev) =>
            Math.min(
                prev,
                Math.max(baseBeatCount, minimumBeatCount, neededBeatCount),
            ),
        );
    };

    const updateScrollState = (nextScrollLeft: number, nextScrollTop: number) => {
        pianoRollViewState.scrollLeft = nextScrollLeft;
        pianoRollViewState.scrollTop = nextScrollTop;
        setScrollLeft(nextScrollLeft);
        setScrollTop(nextScrollTop);
    };

    const setScrollPosition = (nextScrollLeft: number, nextScrollTop: number) => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const maxScrollLeft = Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth);
        const maxScrollTop = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
        const clampedScrollLeft = clamp(nextScrollLeft, 0, maxScrollLeft);
        const clampedScrollTop = clamp(nextScrollTop, 0, maxScrollTop);

        scrollArea.scrollLeft = clampedScrollLeft;
        scrollArea.scrollTop = clampedScrollTop;
        updateScrollState(clampedScrollLeft, clampedScrollTop);
    };

    const updateZoomX = (updater: (value: number) => number) => {
        setZoomX((prev) => {
            const next = updater(prev);
            pianoRollViewState.zoomX = next;
            return next;
        });
    };

    const updateZoomY = (updater: (value: number) => number) => {
        setZoomY((prev) => {
            const next = updater(prev);
            pianoRollViewState.zoomY = next;
            return next;
        });
    };

    useLayoutEffect(() => {
        return subscribeWmlProject((nextProject) => {
            setProject(nextProject);
        });
    }, []);

    useEffect(() => {
        return subscribeArrangementControlState((nextControls) => {
            setArrangementControls(nextControls);
        });
    }, []);

    useEffect(() => {
        return playbackEngine.subscribe((snapshot) => {
            setPlaybackSnapshot(snapshot);
        });
    }, []);

    useLayoutEffect(() => {
        ensureTimelineFillsViewport();

        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const resizeObserver = new ResizeObserver(() => {
            ensureTimelineFillsViewport();
        });

        resizeObserver.observe(scrollArea);

        return () => {
            resizeObserver.disconnect();
        };
    }, [baseBeatCount, beatWidth]);

    useEffect(() => {
        if (restoredViewStateRef.current) return;

        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const maxScrollLeft = Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth);
        const maxScrollTop = Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
        const nextScrollLeft = clamp(pianoRollViewState.scrollLeft, 0, maxScrollLeft);
        const nextScrollTop = clamp(pianoRollViewState.scrollTop, 0, maxScrollTop);

        scrollArea.scrollLeft = nextScrollLeft;
        scrollArea.scrollTop = nextScrollTop;
        updateScrollState(nextScrollLeft, nextScrollTop);
        restoredViewStateRef.current = true;
    }, [contentWidth, contentHeight]);

    useEffect(() => {
        const selectionKey =
            selectedChordId != null
                ? `chord:${selectedChordId}`
                : selectedSectionId != null
                  ? `section:${selectedSectionId}`
                  : null;

        if (selectionKey == null || focusedSelectionRef.current === selectionKey) return;

        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const selectedNotes = pianoRollData.notes.filter((note) =>
            selectedChordId != null
                ? note.chordId === selectedChordId
                : note.sectionId === selectedSectionId,
        );

        if (selectedNotes.length === 0) return;

        const viewportLeft = scrollArea.scrollLeft;
        const viewportRight = viewportLeft + scrollArea.clientWidth;
        const horizontalVisibleNote = selectedNotes.find((note) =>
            isNoteHorizontallyVisible(note, ticksPerBeat, beatWidth, viewportLeft, viewportRight),
        );
        const targetNote =
            horizontalVisibleNote ??
            findClosestHorizontalNote(
                selectedNotes,
                ticksPerBeat,
                beatWidth,
                viewportLeft,
                viewportRight,
            );

        if (!targetNote) return;

        const targetY = noteToY(targetNote.midi, rows, rowHeight);
        if (targetY == null) return;

        const viewportTop = scrollArea.scrollTop;
        const viewportBottom = viewportTop + scrollArea.clientHeight;

        if (
            horizontalVisibleNote &&
            isNoteVerticallyVisible(targetY, rowHeight, viewportTop, viewportBottom)
        ) {
            focusedSelectionRef.current = selectionKey;
            return;
        }

        const nextScrollLeft = horizontalVisibleNote
            ? scrollArea.scrollLeft
            : getCenteredNoteScrollLeft(
                  targetNote,
                  ticksPerBeat,
                  beatWidth,
                  scrollArea.clientWidth,
              );
        const nextScrollTop = targetY + rowHeight / 2 - scrollArea.clientHeight / 2;

        setScrollPosition(nextScrollLeft, nextScrollTop);
        focusedSelectionRef.current = selectionKey;
    }, [
        beatWidth,
        pianoRollData.notes,
        rowHeight,
        rows,
        selectedChordId,
        selectedSectionId,
        ticksPerBeat,
    ]);

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

        setScrollPosition(nextScrollLeft, scrollArea.scrollTop);
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
                    updateZoomY((prev) => clamp(prev - e.deltaY * 0.002, 0.5, 3));
                    return;
                }

                scrollArea.scrollTop += e.deltaY;
                syncScrollState();
                return;
            }

            if (isGridWheel) {
                if (e.ctrlKey) {
                    updateZoomX((prev) => clamp(prev - e.deltaY * 0.002, 0.5, 4));
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

    const updateTempoPreview = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTempoMarkerHovered) {
            setTempoPreviewTick(null);
            return;
        }

        const header = e.currentTarget;
        const rect = header.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;

        setTempoPreviewTick(Math.round(xToTick(x, ticksPerBeat, beatWidth)));
    };

    const openTimeSignatureEditor = (
        e: React.MouseEvent<HTMLDivElement>,
        measure: PianoRollMeasureView,
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const panelRect = panelRef.current?.getBoundingClientRect();
        const explicitEvent = project.timeSignatures.find((event) => event.bar === measure.bar);

        setEditorTarget({
            type: "timeSignature",
            bar: measure.bar,
            eventId: explicitEvent?.id,
        });
        setEditorAnchor(
            panelRect
                ? {
                      x: e.clientX - panelRect.left + 8,
                      y: e.clientY - panelRect.top + 8,
                  }
                : null,
        );
        setEditorBounds(
            panelRect
                ? {
                      width: panelRect.width,
                      height: panelRect.height,
                  }
                : null,
        );
    };

    const openTempoEditor = (
        e: React.MouseEvent<HTMLDivElement>,
        tempo: TempoEvent,
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const panelRect = panelRef.current?.getBoundingClientRect();

        setEditorTarget({
            type: "tempo",
            tick: tempo.tick,
            eventId: tempo.id,
            originalTick: tempo.tick,
            originalBpm: tempo.bpm,
        });
        setEditorAnchor(
            panelRect
                ? {
                      x: e.clientX - panelRect.left + 8,
                      y: e.clientY - panelRect.top + 8,
                  }
                : null,
        );
        setEditorBounds(
            panelRect
                ? {
                      width: panelRect.width,
                      height: panelRect.height,
                  }
                : null,
        );
    };

    const closeEventEditor = () => {
        setEditorTarget(null);
    };

    const cancelEventEditor = () => {
        if (editorTarget?.type === "tempo" && editorTarget.isNew) {
            updateWmlProject((prev) => ({
                ...prev,
                tempos: prev.tempos.filter((tempo) => tempo.id !== editorTarget.eventId),
            }));
        } else if (editorTarget?.type === "tempo" && editorTarget.eventId != null) {
            updateWmlProject((prev) => ({
                ...prev,
                tempos: prev.tempos
                    .map((tempo) =>
                        tempo.id === editorTarget.eventId
                            ? {
                                  ...tempo,
                                  tick: editorTarget.originalTick ?? tempo.tick,
                                  bpm: editorTarget.originalBpm ?? tempo.bpm,
                              }
                            : tempo,
                    )
                    .sort((a, b) => a.tick - b.tick),
            }));
        }

        closeEventEditor();
    };

    const createTempoAtPointer = (
        e: React.MouseEvent<HTMLDivElement>,
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const header = e.currentTarget.closest(".piano-roll-time-header");
        const panelRect = panelRef.current?.getBoundingClientRect();
        if (!(header instanceof HTMLElement)) return;

        const headerRect = header.getBoundingClientRect();
        const x = e.clientX - headerRect.left + scrollLeft;
        const tick = Math.round(xToTick(x, ticksPerBeat, beatWidth));
        const id = createId("tempo");
        const bpm = getTempoAtTick(project.tempos, tick);

        updateWmlProject((prev) => ({
            ...prev,
            tempos: [
                ...prev.tempos,
                {
                    id,
                    tick,
                    bpm,
                },
            ].sort((a, b) => a.tick - b.tick),
        }));

        setEditorTarget({
            type: "tempo",
            tick,
            eventId: id,
            isNew: true,
            originalTick: tick,
            originalBpm: bpm,
        });
        setEditorAnchor(
            panelRect
                ? {
                      x: e.clientX - panelRect.left + 8,
                      y: e.clientY - panelRect.top + 8,
                  }
                : null,
        );
        setEditorBounds(
            panelRect
                ? {
                      width: panelRect.width,
                      height: panelRect.height,
                  }
                : null,
        );
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
                onPointerMove={updateTempoPreview}
                onPointerLeave={() => {
                    setTempoPreviewTick(null);
                    setIsTempoMarkerHovered(false);
                }}
            >
                <div
                    className="piano-roll-time-content"
                    style={{
                        width: contentWidth,
                        transform: `translateX(${-scrollLeft}px)`,
                    }}
                >
                    {measureViews.map((measure) => (
                        <div
                            key={measure.bar}
                            className="piano-roll-measure-label"
                            onDoubleClick={(e) => openTimeSignatureEditor(e, measure)}
                            style={{
                                left: measure.startBeat * beatWidth,
                                width: measure.beatLength * beatWidth,
                                height: HEADER_LANE_HEIGHT,
                            }}
                        >
                            <span className="piano-roll-time-signature-label">
                                {measure.showTimeSignature
                                    ? `${measure.numerator}/${measure.denominator}`
                                    : ""}
                            </span>
                            <span className="piano-roll-measure-number-label">
                                {measure.bar + 1}
                            </span>
                        </div>
                    ))}

                    {beatViews.map((beat) => (
                        <div
                            key={beat.key}
                            className={
                                beat.isMeasureStart
                                    ? "piano-roll-beat-label measure-label"
                                    : "piano-roll-beat-label"
                            }
                            onDoubleClick={createTempoAtPointer}
                            style={{
                                left: beat.startBeat * beatWidth,
                                width: beat.beatLength * beatWidth,
                                top: HEADER_LANE_HEIGHT,
                                height: HEADER_LANE_HEIGHT,
                            }}
                        >
                        </div>
                    ))}

                    {project.tempos.map((tempo) => (
                        <div
                            key={tempo.id}
                            className="piano-roll-tempo-label"
                            onPointerDown={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => openTempoEditor(e, tempo)}
                            onPointerEnter={() => setIsTempoMarkerHovered(true)}
                            onPointerLeave={() => setIsTempoMarkerHovered(false)}
                            style={{
                                left: tempoTickToMarkerLeft(tempo.tick, ticksPerBeat, beatWidth),
                                top: HEADER_LANE_HEIGHT,
                                height: HEADER_LANE_HEIGHT,
                            }}
                        >
                            <span className="piano-roll-tempo-marker" />
                            <span className="piano-roll-tempo-value">{tempo.bpm}</span>
                        </div>
                    ))}

                    {tempoPreviewTick != null && !isTempoMarkerHovered && (
                        <div
                            className="piano-roll-tempo-preview-marker"
                            style={{
                                left: tempoTickToMarkerLeft(
                                    tempoPreviewTick,
                                    ticksPerBeat,
                                    beatWidth,
                                ),
                                top: HEADER_LANE_HEIGHT,
                                height: HEADER_LANE_HEIGHT,
                            }}
                        />
                    )}

                    {playbackEndLeft != null && (
                        <div
                            className="piano-roll-last-note-end-header"
                            style={{ left: playbackEndLeft }}
                        />
                    )}

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
                            />
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

                        {rows
                            .filter((row) => !row.isBlack)
                            .map((row) => (
                                <span
                                    key={row.midi}
                                    className="piano-roll-white-key-label"
                                    style={{
                                        top: getNoteCenterY(row.midi, rows, rowHeight),
                                        fontSize: clamp(rowHeight - 3, 7, 12),
                                    }}
                                >
                                    {row.name}
                                </span>
                            ))}
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

                        {beatViews.map((beat) => (
                            <div
                                key={beat.key}
                                className={
                                    beat.isMeasureStart
                                        ? "piano-roll-grid-line measure-line"
                                        : "piano-roll-grid-line beat-line"
                                }
                                style={{ left: beat.startBeat * beatWidth }}
                            />
                        ))}

                        {pianoRollData.notes.map((note) => {
                            const y = noteToY(note.midi, rows, rowHeight);
                            if (y == null) return null;

                            const isSelectedChord =
                                selectedChordId != null && note.chordId === selectedChordId;
                            const isSelectedSection =
                                selectedSectionId != null && note.sectionId === selectedSectionId;
                            const noteClassName = [
                                "piano-roll-note",
                                isSelectedSection ? "section-selected" : "",
                                isSelectedChord ? "chord-selected" : "",
                            ]
                                .filter(Boolean)
                                .join(" ");

                            return (
                                <div
                                    key={note.id}
                                    className={noteClassName}
                                    data-note-id={note.id}
                                    data-section-id={note.sectionId ?? undefined}
                                    data-chord-id={note.chordId ?? undefined}
                                    style={{
                                        left: tickToX(note.startTick, ticksPerBeat, beatWidth),
                                        top: y + 2,
                                        width: Math.max(
                                            tickToWidth(note.durationTick, ticksPerBeat, beatWidth),
                                            4,
                                        ),
                                        height: Math.max(rowHeight - 4, 4),
                                    }}
                                    title={`${midiToName(note.midi)} / ${note.startTick}`}
                                />
                            );
                        })}

                        {playbackEndLeft != null && (
                            <div
                                className="piano-roll-last-note-end"
                                style={{ left: playbackEndLeft }}
                            />
                        )}

                        <div
                            className="piano-roll-playhead"
                            style={{ left: playheadLeft }}
                        />
                    </div>
                </div>
            </div>

            <EventEditorFloatingWindow
                target={editorTarget}
                anchor={editorAnchor}
                bounds={editorBounds}
                project={project}
                onClose={closeEventEditor}
                onCancel={cancelEventEditor}
            />
        </div>
    );
}

function tickToX(tick: number, ticksPerBeat: number, beatWidth: number) {
    return tick / ticksPerBeat * beatWidth;
}

function tickToWidth(tick: number, ticksPerBeat: number, beatWidth: number) {
    return tickToX(tick, ticksPerBeat, beatWidth);
}

function tempoTickToMarkerLeft(tick: number, ticksPerBeat: number, beatWidth: number) {
    return tickToX(tick, ticksPerBeat, beatWidth) - TEMPO_MARKER_WIDTH / 2;
}

function getTempoAtTick(tempos: TempoEvent[], tick: number) {
    const sorted = [...tempos]
        .filter((tempo) => Number.isFinite(tempo.tick) && Number.isFinite(tempo.bpm))
        .sort((a, b) => a.tick - b.tick);
    let bpm = 120;

    for (const tempo of sorted) {
        if (tempo.tick > tick) break;
        bpm = tempo.bpm;
    }

    return bpm;
}

function getNoteLeft(note: PianoRollNoteView, ticksPerBeat: number, beatWidth: number) {
    return tickToX(note.startTick, ticksPerBeat, beatWidth);
}

function getNoteRight(note: PianoRollNoteView, ticksPerBeat: number, beatWidth: number) {
    return getNoteLeft(note, ticksPerBeat, beatWidth) +
        tickToWidth(note.durationTick, ticksPerBeat, beatWidth);
}

function isNoteHorizontallyVisible(
    note: PianoRollNoteView,
    ticksPerBeat: number,
    beatWidth: number,
    viewportLeft: number,
    viewportRight: number,
) {
    const noteLeft = getNoteLeft(note, ticksPerBeat, beatWidth);
    const noteRight = getNoteRight(note, ticksPerBeat, beatWidth);

    return noteRight >= viewportLeft && noteLeft <= viewportRight;
}

function isNoteVerticallyVisible(
    noteTop: number,
    rowHeight: number,
    viewportTop: number,
    viewportBottom: number,
) {
    const noteBottom = noteTop + rowHeight;

    return noteBottom >= viewportTop && noteTop <= viewportBottom;
}

function findClosestHorizontalNote(
    notes: PianoRollNoteView[],
    ticksPerBeat: number,
    beatWidth: number,
    viewportLeft: number,
    viewportRight: number,
): PianoRollNoteView | null {
    let closestNote: PianoRollNoteView | null = null;
    let closestDistance = Infinity;

    for (const note of notes) {
        const noteLeft = getNoteLeft(note, ticksPerBeat, beatWidth);
        const noteRight = getNoteRight(note, ticksPerBeat, beatWidth);
        const distance =
            noteRight < viewportLeft
                ? viewportLeft - noteRight
                : noteLeft > viewportRight
                  ? noteLeft - viewportRight
                  : 0;

        if (distance < closestDistance) {
            closestDistance = distance;
            closestNote = note;
        }
    }

    return closestNote;
}

function getCenteredNoteScrollLeft(
    note: PianoRollNoteView,
    ticksPerBeat: number,
    beatWidth: number,
    viewportWidth: number,
) {
    const noteLeft = getNoteLeft(note, ticksPerBeat, beatWidth);
    const noteWidth = tickToWidth(note.durationTick, ticksPerBeat, beatWidth);

    return noteLeft + noteWidth / 2 - viewportWidth / 2;
}

function xToTick(x: number, ticksPerBeat: number, beatWidth: number) {
    return Math.max(0, x / beatWidth * ticksPerBeat);
}

function createMeasureViews(
    timeSignatures: TimeSignatureEvent[],
    totalBeatCount: number,
): PianoRollMeasureView[] {
    const events = normalizeTimeSignatureEvents(timeSignatures);
    const result: PianoRollMeasureView[] = [];

    let eventIndex = 0;
    let current = events[0];
    let beat = 0;
    let bar = 0;

    while (beat < totalBeatCount) {
        while (eventIndex + 1 < events.length && events[eventIndex + 1].bar <= bar) {
            eventIndex += 1;
            current = events[eventIndex];
        }

        const beatLength = getTimeSignatureBeatLength(current);

        result.push({
            bar,
            startBeat: beat,
            beatLength,
            numerator: current.numerator,
            denominator: current.denominator,
            showTimeSignature: events.some((event) => event.bar === bar),
        });

        beat += beatLength;
        bar += 1;
    }

    return result;
}

function getMeasureViewEndBeat(measures: PianoRollMeasureView[]) {
    const lastMeasure = measures[measures.length - 1];
    if (!lastMeasure) return 0;

    return lastMeasure.startBeat + lastMeasure.beatLength;
}

function createBeatViews(
    measures: PianoRollMeasureView[],
    totalBeatCount: number,
): PianoRollBeatView[] {
    const result: PianoRollBeatView[] = [];
    let label = 1;

    for (const measure of measures) {
        const beatLength = 4 / measure.denominator;

        for (let beat = 0; beat <= measure.numerator; beat += 1) {
            const startBeat = measure.startBeat + beat * beatLength;
            if (startBeat > totalBeatCount) break;

            const isMeasureEnd = beat === measure.numerator;
            const nextMeasure = measures.find(
                (candidate) => Math.abs(candidate.startBeat - startBeat) < 0.0001,
            );

            if (isMeasureEnd && nextMeasure) continue;

            result.push({
                key: `${measure.bar}-${beat}`,
                label,
                startBeat,
                beatLength,
                isMeasureStart: beat === 0,
            });

            label += 1;
        }
    }

    return result;
}

function normalizeTimeSignatureEvents(
    timeSignatures: TimeSignatureEvent[],
): TimeSignatureEvent[] {
    const byBar = new Map<number, TimeSignatureEvent>();

    byBar.set(0, {
        id: "default-timesig",
        ...DEFAULT_TIME_SIGNATURE,
    });

    for (const event of timeSignatures) {
        const bar = Math.max(0, Math.round(event.bar));
        const numerator = normalizePositiveInteger(event.numerator, DEFAULT_TIME_SIGNATURE.numerator);
        const denominator = normalizePositiveInteger(event.denominator, DEFAULT_TIME_SIGNATURE.denominator);

        byBar.set(bar, {
            ...event,
            bar,
            numerator,
            denominator,
        });
    }

    const sorted = [...byBar.values()].sort((a, b) => a.bar - b.bar);
    const compacted: TimeSignatureEvent[] = [];

    for (const event of sorted) {
        const previous = compacted[compacted.length - 1];

        if (
            previous &&
            previous.numerator === event.numerator &&
            previous.denominator === event.denominator
        ) {
            continue;
        }

        compacted.push(event);
    }

    return compacted;
}

function getTimeSignatureBeatLength(timeSignature: Pick<TimeSignatureEvent, "numerator" | "denominator">) {
    return timeSignature.numerator * 4 / timeSignature.denominator;
}

function normalizePositiveInteger(value: number, fallback: number) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
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
    contentHeight: number,
): PianoWhiteKey[] {
    const whiteRows = rows.filter((row) => !row.isBlack);
    const whiteKeyHeight = contentHeight / whiteRows.length;

    return whiteRows.map((row, index) => {
        return {
            midi: row.midi,
            top: index * whiteKeyHeight,
            height: whiteKeyHeight,
        };
    });
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
