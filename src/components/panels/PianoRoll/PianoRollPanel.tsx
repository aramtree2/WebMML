import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    clearSelectedNote,
    getArrangementControlState,
    selectNote,
    subscribeArrangementControlState,
} from "../../../core/editor/arrangementControlStore";
import {
    getPaletteState,
    subscribePaletteState,
} from "../../../core/editor/paletteStore";
import { EventEditorFloatingWindow } from "../../eventEditor";
import type { EventEditorAnchor, EventEditorTarget } from "../../eventEditor";
import { playbackEngine, secondsToTick, tickToSeconds } from "../../../core/playback";
import { getWmlProject, subscribeWmlProject, updateWmlProject } from "../../../core/wml/wmlStore";
import { createId } from "../../../core/wml/wmlUtils";
import type { NoteEvent } from "../../../core/wml/wmlTypes";
import type { SustainEvent } from "../../../core/wml/wmlTypes";
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
const EVENT_LANE_HEIGHT = HEADER_HEIGHT;
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
const NOTE_CYCLE_CLICK_DELAY_MS = 180;

const AUTO_SCROLL_RIGHT_RATIO = 0.75;
const AUTO_SCROLL_LEFT_RATIO = 0.15;
const SEEK_SCROLL_EVENT = "webmml:seek-scroll";
const GRID_SUBDIVISION_OPTIONS = [0, 1, 2, 4, 8] as const;
const EVENT_LANES = [
    {
        key: "automation",
        label: "볼륨 그래프",
        title: "초록색 : 서스테인 on, 파란색 : 서스테인 off",
    },
] as const;

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

type PianoRollSubdivisionView = {
    key: string;
    startBeat: number;
};

type PianoRollNotePreview = {
    midi: number;
    tick: number;
    durationTick: number;
};

type PianoRollVelocityLabelView = {
    key: string;
    midi: number;
    tick: number;
    velocity: number;
};

type PianoRollVelocityGraphPoint = {
    tick: number;
    velocity: number;
};

type PianoRollVelocityGraphSegment = {
    key: string;
    points: string;
    sustained: boolean;
};

type PianoRollNoteDraft = {
    midi: number;
    startTick: number;
    startPointerTick: number;
    unitTick: number;
    sectionId: string;
    chordId: string;
    pointerId: number;
};

type PianoRollNoteResizeDraft = {
    sectionId: string;
    chordId: string;
    noteId: string;
    startPointerTick: number;
    originalDurationTick: number;
    unitTick: number;
    pointerId: number;
};

const pianoRollViewState = {
    scrollLeft: 0,
    scrollTop: 0,
    zoomX: 1,
    zoomY: 1,
    gridSubdivision: 1,
};

export function PianoRollPanel() {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement | null>(null);
    const restoredViewStateRef = useRef(false);
    const focusedSelectionRef = useRef<string | null>(null);
    const suppressedSelectionFocusRef = useRef<string | null>(null);
    const pendingNoteCycleTimerRef = useRef<number | null>(null);
    const noteDraftRef = useRef<PianoRollNoteDraft | null>(null);
    const noteResizeDraftRef = useRef<PianoRollNoteResizeDraft | null>(null);
    const previousPaletteSnapItemRef = useRef<string | null>(null);

    const [project, setProject] = useState(() => getWmlProject());
    const [arrangementControls, setArrangementControls] = useState(() =>
        getArrangementControlState(),
    );
    const [paletteState, setPaletteState] = useState(() => getPaletteState());
    const [playbackSnapshot, setPlaybackSnapshot] = useState(() => playbackEngine.getSnapshot());

    const [scrollLeft, setScrollLeft] = useState(() => pianoRollViewState.scrollLeft);
    const [scrollTop, setScrollTop] = useState(() => pianoRollViewState.scrollTop);
    const [zoomX, setZoomX] = useState(() => pianoRollViewState.zoomX);
    const [zoomY, setZoomY] = useState(() => pianoRollViewState.zoomY);
    const [gridSubdivision, setGridSubdivision] = useState(
        () => pianoRollViewState.gridSubdivision,
    );
    const [editorTarget, setEditorTarget] = useState<EventEditorTarget | null>(null);
    const [editorAnchor, setEditorAnchor] = useState<EventEditorAnchor | null>(null);
    const [editorBounds, setEditorBounds] = useState<{ width: number; height: number } | null>(
        null,
    );
    const [tempoPreviewTick, setTempoPreviewTick] = useState<number | null>(null);
    const [isTempoMarkerHovered, setIsTempoMarkerHovered] = useState(false);
    const [sustainPreview, setSustainPreview] = useState<{
        tick: number;
        value: number;
    } | null>(null);
    const [isSustainMarkerHovered, setIsSustainMarkerHovered] = useState(false);
    const [timelineBeatCount, setTimelineBeatCount] = useState(INITIAL_TIMELINE_BEAT_COUNT);
    const [notePreview, setNotePreview] = useState<PianoRollNotePreview | null>(null);
    const [noteResizePreview, setNoteResizePreview] = useState<{
        noteId: string;
        durationTick: number;
    } | null>(null);

    const rows = useMemo(() => createNoteRows(), []);
    const pianoRollData = useMemo(
        () => wmlProjectToPianoRollData(project, arrangementControls),
        [project, arrangementControls],
    );
    const selectedSectionId = arrangementControls.selectedSectionId;
    const selectedChordId = arrangementControls.selectedChordId;
    const selectedNoteId = arrangementControls.selectedNoteId;
    const selectedPaletteItem = paletteState.selectedItem;

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
    const subdivisionViews = useMemo(
        () => createSubdivisionViews(beatViews, gridSubdivision),
        [beatViews, gridSubdivision],
    );
    const eventLaneHeight = EVENT_LANES.length * EVENT_LANE_HEIGHT;
    const velocityLabelViews = useMemo(
        () => createVelocityLabelViews(pianoRollData.notes, selectedChordId),
        [pianoRollData.notes, selectedChordId],
    );
    const velocityGraphSegments = useMemo(
        () =>
            createVelocityGraphSegments(
                pianoRollData.notes,
                selectedChordId,
                selectedSectionId,
                project.sections,
                contentBeatCount,
                ticksPerBeat,
                beatWidth,
                eventLaneHeight,
            ),
        [
            beatWidth,
            contentBeatCount,
            eventLaneHeight,
            pianoRollData.notes,
            project.sections,
            selectedChordId,
            selectedSectionId,
            ticksPerBeat,
        ],
    );
    const selectedSectionSustainEvents = useMemo(
        () =>
            selectedSectionId == null
                ? []
                : [
                      ...(project.sections.find((section) => section.id === selectedSectionId)
                          ?.sustain ?? []),
                  ].sort((a, b) => a.tick - b.tick),
        [project.sections, selectedSectionId],
    );

    const contentWidth = contentBeatCount * beatWidth;
    const noteGridHeight = rows.length * rowHeight;
    const contentHeight = noteGridHeight;
    const whiteKeys = createWhiteKeys(rows, noteGridHeight);

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

    const updateGridSubdivision = (value: number) => {
        const next = GRID_SUBDIVISION_OPTIONS.includes(
            value as (typeof GRID_SUBDIVISION_OPTIONS)[number],
        )
            ? value
            : 1;

        pianoRollViewState.gridSubdivision = next;
        setGridSubdivision(next);
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
        return subscribePaletteState((nextState) => {
            setPaletteState(nextState);
        });
    }, []);

    useEffect(() => {
        const snapItemKey =
            selectedPaletteItem?.type === "note-duration"
                ? `${selectedPaletteItem.type}:${selectedPaletteItem.denominator}`
                : null;

        if (previousPaletteSnapItemRef.current === snapItemKey) return;

        previousPaletteSnapItemRef.current = snapItemKey;
        if (selectedPaletteItem?.type !== "note-duration") return;
        if (gridSubdivision <= 0) return;

        const requiredSubdivision = getGridSubdivisionForNoteDenominator(
            selectedPaletteItem.denominator,
        );

        if (requiredSubdivision > gridSubdivision) {
            updateGridSubdivision(requiredSubdivision);
        }
    }, [gridSubdivision, selectedPaletteItem]);

    useEffect(() => {
        return playbackEngine.subscribe((snapshot) => {
            setPlaybackSnapshot(snapshot);
        });
    }, []);

    useEffect(() => {
        return () => {
            clearPendingNoteCycle();
        };
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
            selectedNoteId != null
                ? `note:${selectedNoteId}`
                : selectedChordId != null
                ? `chord:${selectedChordId}`
                : selectedSectionId != null
                  ? `section:${selectedSectionId}`
                  : null;

        if (selectionKey == null) return;

        if (suppressedSelectionFocusRef.current === selectionKey) {
            focusedSelectionRef.current = selectionKey;
            suppressedSelectionFocusRef.current = null;
            return;
        }

        if (focusedSelectionRef.current === selectionKey) return;

        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return;

        const selectedNotes = selectedNoteId != null
            ? pianoRollData.notes.filter((note) => note.id === selectedNoteId)
            : pianoRollData.notes.filter((note) =>
                  selectedChordId != null
                      ? note.chordId === selectedChordId
                      : note.sectionId === selectedSectionId,
              );

        if (selectedNotes.length === 0) return;

        const viewportLeft = scrollArea.scrollLeft;
        const viewportRight = viewportLeft + scrollArea.clientWidth;
        const horizontalVisibleNote = selectedNotes.find((note) =>
            isNoteHorizontallyVisible(
                note,
                ticksPerBeat,
                beatWidth,
                viewportLeft,
                viewportRight,
            ),
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
        selectedNoteId,
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
        const handleSeekScroll = (event: Event) => {
            const scrollArea = scrollAreaRef.current;
            const customEvent = event as CustomEvent<SeekScrollEventDetail>;
            const detail = customEvent.detail;
            if (!scrollArea || detail?.source === "piano-roll") return;

            const targetLeft = tickToX(detail.tick, ticksPerBeat, beatWidth);
            const viewportLeft = scrollArea.scrollLeft;
            const viewportRight = viewportLeft + scrollArea.clientWidth;

            if (targetLeft >= viewportLeft && targetLeft <= viewportRight) return;

            setScrollPosition(
                targetLeft - scrollArea.clientWidth / 2,
                scrollArea.scrollTop,
            );
        };

        window.addEventListener(SEEK_SCROLL_EVENT, handleSeekScroll);

        return () => {
            window.removeEventListener(SEEK_SCROLL_EVENT, handleSeekScroll);
        };
    }, [beatWidth, ticksPerBeat]);

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
        dispatchSeekScrollEvent("piano-roll", tick);
    };

    const updateTempoPreview = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isTempoMarkerHovered) {
            setTempoPreviewTick(null);
            return;
        }

        const header = e.currentTarget;
        const rect = header.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;
        const tick = snapTickToGrid(
            xToTick(x, ticksPerBeat, beatWidth),
            ticksPerBeat,
            gridSubdivision,
        );

        setTempoPreviewTick(tick);
    };

    const clearPendingNoteCycle = () => {
        if (pendingNoteCycleTimerRef.current == null) return;

        window.clearTimeout(pendingNoteCycleTimerRef.current);
        pendingNoteCycleTimerRef.current = null;
    };

    const selectNoteAtPointer = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.detail >= 2) return;

        clearPendingNoteCycle();

        const hitPoint = getNoteHitPoint(e);
        if (!hitPoint) return;

        const candidates = getSelectableNoteCandidatesAtPoint(
            pianoRollData.notes,
            hitPoint.x,
            hitPoint.y,
            rows,
            rowHeight,
            ticksPerBeat,
            beatWidth,
            selectedSectionId,
            selectedChordId,
        );
        const selectedIndex = candidates.findIndex((note) => note.id === selectedNoteId);
        const note =
            selectedIndex >= 0 && candidates.length > 1
                ? candidates[(selectedIndex + 1) % candidates.length]
                : candidates[0];

        if (!note?.sectionId || !note.chordId) return;
        const sectionId = note.sectionId;
        const chordId = note.chordId;
        const noteId = note.id;

        if (selectedIndex >= 0 && candidates.length > 1) {
            pendingNoteCycleTimerRef.current = window.setTimeout(() => {
                suppressedSelectionFocusRef.current = `note:${noteId}`;
                selectNote(sectionId, chordId, noteId);
                pendingNoteCycleTimerRef.current = null;
            }, NOTE_CYCLE_CLICK_DELAY_MS);
            return;
        }

        suppressedSelectionFocusRef.current = `note:${noteId}`;
        selectNote(sectionId, chordId, noteId);
    };

    const openNoteEditorAtPointer = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        clearPendingNoteCycle();

        const hitPoint = getNoteHitPoint(e);
        if (!hitPoint) return;

        const note = findSelectedOrSelectableNoteAtPoint(
            pianoRollData.notes,
            hitPoint.x,
            hitPoint.y,
            rows,
            rowHeight,
            ticksPerBeat,
            beatWidth,
            selectedSectionId,
            selectedChordId,
            selectedNoteId,
        );
        if (!note?.sectionId || !note.chordId) return;

        suppressedSelectionFocusRef.current = `note:${note.id}`;
        selectNote(note.sectionId, note.chordId, note.id);

        const panelRect = panelRef.current?.getBoundingClientRect();

        setEditorTarget({
            type: "note",
            noteId: note.id,
            sectionId: note.sectionId,
            chordId: note.chordId,
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

    const getNoteHitPoint = (e: React.MouseEvent<HTMLDivElement>) => {
        const scrollArea = scrollAreaRef.current;
        if (!scrollArea) return null;

        const rect = scrollArea.getBoundingClientRect();

        return {
            x: e.clientX - rect.left + scrollArea.scrollLeft,
            y: e.clientY - rect.top + scrollArea.scrollTop,
        };
    };

    const updateNotePreview = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.target instanceof Element && e.target.closest(".piano-roll-note")) {
            setNotePreview(null);
            return;
        }

        if (noteDraftRef.current) {
            updateNoteDraftPreview(e);
            return;
        }

        const preview = getNotePreviewAtPointer(e);

        if (!preview) {
            setNotePreview(null);
            return;
        }

        setNotePreview(preview);
    };

    const beginNoteResize = (
        e: React.PointerEvent<HTMLDivElement>,
        note: PianoRollNoteView,
    ) => {
        if (e.button !== 0) return;
        if (!note.sectionId || !note.chordId) return;
        if (selectedPaletteItem?.type !== "note-duration") return;

        e.preventDefault();
        e.stopPropagation();

        noteResizeDraftRef.current = {
            sectionId: note.sectionId,
            chordId: note.chordId,
            noteId: note.id,
            startPointerTick: getPointerTick(e),
            originalDurationTick: note.durationTick,
            unitTick: getPaletteNoteDurationTick(selectedPaletteItem.denominator, ticksPerBeat),
            pointerId: e.pointerId,
        };
        setNoteResizePreview({
            noteId: note.id,
            durationTick: note.durationTick,
        });
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const updateNoteResize = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteResizeDraftRef.current;
        if (!draft || draft.pointerId !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();

        const durationTick = getResizeDurationTick(
            draft.originalDurationTick,
            draft.startPointerTick,
            getPointerTick(e),
            draft.unitTick,
        );

        setNoteResizePreview({
            noteId: draft.noteId,
            durationTick,
        });
    };

    const commitNoteResize = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteResizeDraftRef.current;
        if (!draft || draft.pointerId !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();

        const durationTick = getResizeDurationTick(
            draft.originalDurationTick,
            draft.startPointerTick,
            getPointerTick(e),
            draft.unitTick,
        );

        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        noteResizeDraftRef.current = null;
        setNoteResizePreview(null);
        updateNoteDuration(draft, durationTick);
    };

    const cancelNoteResize = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteResizeDraftRef.current;
        if (!draft || draft.pointerId !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        noteResizeDraftRef.current = null;
        setNoteResizePreview(null);
    };

    const updateNoteDuration = (
        draft: Pick<PianoRollNoteResizeDraft, "sectionId" | "chordId" | "noteId">,
        durationTick: number,
    ) => {
        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === draft.sectionId
                    ? {
                          ...section,
                          chords: section.chords.map((chord) =>
                              chord.id === draft.chordId
                                  ? {
                                        ...chord,
                                        notes:
                                            durationTick <= 0
                                                ? chord.notes.filter((note) => note.id !== draft.noteId)
                                                : chord.notes.map((note) =>
                                                      note.id === draft.noteId
                                                          ? {
                                                                ...note,
                                                                duration: durationTick,
                                                            }
                                                          : note,
                                                  ),
                                    }
                                  : chord,
                          ),
                      }
                    : section,
            ),
        }));
    };

    const getNotePreviewAtPointer = (
        e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
    ): PianoRollNotePreview | null => {
        if (
            selectedSectionId == null ||
            selectedChordId == null ||
            selectedPaletteItem?.type !== "note-duration"
        ) {
            return null;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
        const y = e.clientY - rect.top + e.currentTarget.scrollTop;
        const row = rows[Math.floor(y / rowHeight)];

        if (!row) {
            return null;
        }

        return {
            midi: row.midi,
            tick: snapTickToGrid(xToTick(x, ticksPerBeat, beatWidth), ticksPerBeat, gridSubdivision),
            durationTick: getPaletteNoteDurationTick(selectedPaletteItem.denominator, ticksPerBeat),
        };
    };

    const getPointerTick = (
        e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
    ) => {
        const scrollArea = scrollAreaRef.current;
        const rect = (scrollArea ?? e.currentTarget).getBoundingClientRect();
        const scrollX = scrollArea?.scrollLeft ?? e.currentTarget.scrollLeft;
        const x = e.clientX - rect.left + scrollX;

        return xToTick(x, ticksPerBeat, beatWidth);
    };

    const beginNoteDraft = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();

        const preview = getNotePreviewAtPointer(e);
        if (!preview || selectedSectionId == null || selectedChordId == null) return;

        noteDraftRef.current = {
            midi: preview.midi,
            startTick: preview.tick,
            startPointerTick: getPointerTick(e),
            unitTick: preview.durationTick,
            sectionId: selectedSectionId,
            chordId: selectedChordId,
            pointerId: e.pointerId,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        setNotePreview(preview);
    };

    const updateNoteDraftPreview = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteDraftRef.current;
        if (!draft) return;
        e.preventDefault();

        const tick = getPointerTick(e);
        const durationTick = getDraftDurationTick(
            draft.startPointerTick,
            tick,
            draft.unitTick,
        );

        setNotePreview({
            midi: draft.midi,
            tick: draft.startTick,
            durationTick,
        });
    };

    const commitNoteDraft = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteDraftRef.current;
        if (!draft || draft.pointerId !== e.pointerId) return;
        e.preventDefault();

        updateNoteDraftPreview(e);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }

        const tick = getPointerTick(e);
        const durationTick = getDraftDurationTick(
            draft.startPointerTick,
            tick,
            draft.unitTick,
        );
        noteDraftRef.current = null;

        if (durationTick <= 0) {
            setNotePreview(null);
            return;
        }

        const noteId = createId("note");

        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === draft.sectionId
                    ? {
                          ...section,
                          chords: section.chords.map((chord) =>
                              chord.id === draft.chordId
                                  ? {
                                        ...chord,
                                        notes: [
                                            ...chord.notes,
                                            {
                                                id: noteId,
                                                pitch: draft.midi,
                                                tick: draft.startTick,
                                                duration: durationTick,
                                                velocity: getPreviousVelocityForTick(
                                                    chord.notes,
                                                    draft.startTick,
                                                ),
                                            },
                                        ].sort((a, b) => a.tick - b.tick || a.pitch - b.pitch),
                                    }
                                  : chord,
                          ),
                      }
                    : section,
            ),
        }));
        suppressedSelectionFocusRef.current = `note:${noteId}`;
        selectNote(draft.sectionId, draft.chordId, noteId);
    };

    const cancelNoteDraft = (e: React.PointerEvent<HTMLDivElement>) => {
        const draft = noteDraftRef.current;
        e.preventDefault();
        if (!draft || draft.pointerId !== e.pointerId) {
            setNotePreview(null);
            return;
        }

        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        noteDraftRef.current = null;
        setNotePreview(null);
    };

    const clearNoteSelectionOnEmptyClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target instanceof Element && e.target.closest(".piano-roll-note")) return;
        if (selectedPaletteItem != null) return;

        clearSelectedNote();
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
        const tick = snapTickToGrid(
            xToTick(x, ticksPerBeat, beatWidth),
            ticksPerBeat,
            gridSubdivision,
        );
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

    const createSustainAtPointer = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedSectionId == null) return;

        const tick = getSustainTickAtPointer(e);
        const previousValue = getSustainValueBeforeTick(selectedSectionSustainEvents, tick);
        const nextValue = previousValue > 0 ? 0 : 1;
        const id = createId("sustain");

        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === selectedSectionId
                    ? {
                          ...section,
                          sustain: [
                              ...section.sustain.filter((event) => event.tick !== tick),
                              {
                                  id,
                                  tick,
                                  value: nextValue,
                              },
                          ].sort((a, b) => a.tick - b.tick),
                      }
                    : section,
            ),
        }));
    };

    const updateSustainPreview = (e: React.PointerEvent<HTMLDivElement>) => {
        if (selectedSectionId == null || isSustainMarkerHovered) {
            setSustainPreview(null);
            return;
        }

        const tick = getSustainTickAtPointer(e);
        const previousValue = getSustainValueBeforeTick(selectedSectionSustainEvents, tick);

        setSustainPreview({
            tick,
            value: previousValue > 0 ? 0 : 1,
        });
    };

    const getSustainTickAtPointer = (
        e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>,
    ) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left + scrollLeft;

        return snapTickToGrid(
            xToTick(x, ticksPerBeat, beatWidth),
            ticksPerBeat,
            gridSubdivision,
        );
    };

    const deleteSustainEvent = (
        e: React.MouseEvent<HTMLDivElement>,
        eventId: string,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedSectionId == null) return;

        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === selectedSectionId
                    ? {
                          ...section,
                          sustain: section.sustain.filter((event) => event.id !== eventId),
                      }
                    : section,
            ),
        }));
    };

    return (
        <div ref={panelRef} className="panel-content piano-roll-panel">
            <div
                className="piano-roll-corner"
                style={{
                    width: KEYBOARD_WIDTH,
                    height: HEADER_HEIGHT,
                }}
            >
                <select
                    className="piano-roll-grid-unit-select"
                    value={gridSubdivision}
                    title="그리드 단위"
                    aria-label="그리드 단위"
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => updateGridSubdivision(Number(e.target.value))}
                >
                    {GRID_SUBDIVISION_OPTIONS.map((division) => (
                        <option key={division} value={division}>
                            {division === 0
                                ? "스냅 없음"
                                : division === 1
                                  ? "1박"
                                  : `1/${division}박`}
                        </option>
                    ))}
                </select>
            </div>

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

                    {subdivisionViews.map((subdivision) => (
                        <div
                            key={subdivision.key}
                            className="piano-roll-beat-subdivision-label"
                            style={{
                                left: subdivision.startBeat * beatWidth,
                                top: HEADER_LANE_HEIGHT,
                                height: HEADER_LANE_HEIGHT,
                            }}
                        />
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
                </div>
                <div
                    className="piano-roll-playhead-header"
                    style={{ left: playheadLeft - scrollLeft }}
                />
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
                    onPointerMove={updateNotePreview}
                    onPointerLeave={() => {
                        if (!noteDraftRef.current) setNotePreview(null);
                    }}
                >
                    <div
                        className="piano-roll-grid"
                        onPointerDown={beginNoteDraft}
                        onPointerUp={commitNoteDraft}
                        onPointerCancel={cancelNoteDraft}
                        onClick={clearNoteSelectionOnEmptyClick}
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

                        {subdivisionViews.map((subdivision) => (
                            <div
                                key={subdivision.key}
                                className="piano-roll-grid-line subdivision-line"
                                style={{ left: subdivision.startBeat * beatWidth }}
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
                            const isSelectedNote = selectedNoteId === note.id;
                            const resizePreviewDurationTick =
                                noteResizePreview?.noteId === note.id
                                    ? noteResizePreview.durationTick
                                    : null;
                            const renderedDurationTick =
                                resizePreviewDurationTick == null
                                    ? note.durationTick
                                    : Math.max(1, resizePreviewDurationTick);
                            const noteClassName = [
                                "piano-roll-note",
                                isSelectedSection ? "section-selected" : "",
                                isSelectedChord ? "chord-selected" : "",
                                isSelectedNote ? "note-selected" : "",
                                resizePreviewDurationTick != null ? "resize-preview" : "",
                                resizePreviewDurationTick != null && resizePreviewDurationTick <= 0
                                    ? "resize-zero"
                                    : "",
                                isSelectedNote && selectedPaletteItem?.type === "note-duration"
                                    ? "resizable"
                                    : "",
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
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={selectNoteAtPointer}
                                    onDoubleClick={openNoteEditorAtPointer}
                                    style={{
                                        left: tickToX(note.startTick, ticksPerBeat, beatWidth),
                                        top: y + 2,
                                        width: Math.max(
                                            tickToWidth(
                                                renderedDurationTick,
                                                ticksPerBeat,
                                                beatWidth,
                                            ),
                                            4,
                                        ),
                                        height: Math.max(rowHeight - 4, 4),
                                    }}
                                    title={`${midiToName(note.midi)} / ${note.startTick}`}
                                >
                                    {isSelectedNote &&
                                        selectedPaletteItem?.type === "note-duration" && (
                                            <div
                                                className="piano-roll-note-resize-handle"
                                                onPointerDown={(e) => beginNoteResize(e, note)}
                                                onPointerMove={updateNoteResize}
                                                onPointerUp={commitNoteResize}
                                                onPointerCancel={cancelNoteResize}
                                            />
                                        )}
                                </div>
                            );
                        })}

                        {velocityLabelViews.map((label) => {
                            const y = noteToY(label.midi, rows, rowHeight);
                            if (y == null) return null;

                            return (
                                <div
                                    key={label.key}
                                    className="piano-roll-velocity-label"
                                    style={{
                                        left: tickToX(label.tick, ticksPerBeat, beatWidth),
                                        top: Math.max(0, y - 15),
                                    }}
                                >
                                    V{label.velocity}
                                </div>
                            );
                        })}

                        {notePreview != null && (
                            <div
                                className="piano-roll-note-preview"
                                style={{
                                    left: tickToX(notePreview.tick, ticksPerBeat, beatWidth),
                                    top: (noteToY(notePreview.midi, rows, rowHeight) ?? 0) + 2,
                                    width:
                                        notePreview.durationTick > 0
                                            ? Math.max(
                                                  tickToWidth(
                                                      notePreview.durationTick,
                                                      ticksPerBeat,
                                                      beatWidth,
                                                  ),
                                                  4,
                                              )
                                            : 0,
                                    height: Math.max(rowHeight - 4, 4),
                                }}
                            />
                        )}

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

                <div
                    className="piano-roll-event-lane-keys"
                    style={{
                        width: KEYBOARD_WIDTH,
                        height: eventLaneHeight,
                    }}
                >
                    {EVENT_LANES.map((lane, index) => (
                        <div
                            key={lane.key}
                            className="piano-roll-event-lane-key"
                            style={{
                                top: index * EVENT_LANE_HEIGHT,
                                height: EVENT_LANE_HEIGHT,
                            }}
                        >
                            <span title={lane.title}>{lane.label}</span>
                        </div>
                    ))}
                </div>
                <div
                    className="piano-roll-event-lane-corner"
                    style={{ width: KEYBOARD_WIDTH }}
                />
                <div
                    className="piano-roll-event-lanes"
                    onDoubleClick={createSustainAtPointer}
                    onPointerMove={updateSustainPreview}
                    onPointerLeave={() => {
                        setSustainPreview(null);
                        setIsSustainMarkerHovered(false);
                    }}
                    style={{
                        left: KEYBOARD_WIDTH,
                        height: eventLaneHeight,
                    }}
                >
                    <div
                        className="piano-roll-event-lanes-content"
                        style={{
                            width: contentWidth,
                            height: eventLaneHeight,
                            transform: `translateX(${-scrollLeft}px)`,
                        }}
                    >
                        {EVENT_LANES.map((lane, laneIndex) => (
                            <div
                                key={lane.key}
                                className="piano-roll-event-lane-row"
                                style={{
                                    top: laneIndex * EVENT_LANE_HEIGHT,
                                    height: EVENT_LANE_HEIGHT,
                                }}
                            />
                        ))}

                        {EVENT_LANES.flatMap((lane, laneIndex) =>
                            beatViews.map((beat) => (
                                <div
                                    key={`${lane.key}-${beat.key}`}
                                    className={
                                        beat.isMeasureStart
                                            ? "piano-roll-event-lane-beat measure-line"
                                            : "piano-roll-event-lane-beat beat-line"
                                    }
                                    style={{
                                        left: beat.startBeat * beatWidth,
                                        width: beat.beatLength * beatWidth,
                                        top: laneIndex * EVENT_LANE_HEIGHT,
                                        height: EVENT_LANE_HEIGHT,
                                    }}
                                />
                            )),
                        )}

                        {EVENT_LANES.flatMap((lane, laneIndex) =>
                            subdivisionViews.map((subdivision) => (
                                <div
                                    key={`${lane.key}-${subdivision.key}`}
                                    className="piano-roll-event-lane-subdivision"
                                    style={{
                                        left: subdivision.startBeat * beatWidth,
                                        top: laneIndex * EVENT_LANE_HEIGHT,
                                        height: EVENT_LANE_HEIGHT,
                                    }}
                                />
                            )),
                        )}

                        {velocityGraphSegments.length > 0 && (
                            <svg
                                className="piano-roll-velocity-graph"
                                width={contentWidth}
                                height={eventLaneHeight}
                                viewBox={`0 0 ${contentWidth} ${eventLaneHeight}`}
                                preserveAspectRatio="none"
                            >
                                {velocityGraphSegments.map((segment) => (
                                    <polyline
                                        key={segment.key}
                                        className={segment.sustained ? "sustained" : undefined}
                                        points={segment.points}
                                    />
                                ))}
                            </svg>
                        )}

                        {sustainPreview != null && !isSustainMarkerHovered && (
                            <div
                                className={
                                    sustainPreview.value > 0
                                        ? "piano-roll-sustain-marker preview on"
                                        : "piano-roll-sustain-marker preview off"
                                }
                                style={{
                                    left:
                                        tickToX(sustainPreview.tick, ticksPerBeat, beatWidth) -
                                        TEMPO_MARKER_WIDTH / 2,
                                    top: 3,
                                    height: Math.max(4, eventLaneHeight - 6),
                                }}
                            />
                        )}

                        {selectedSectionSustainEvents.map((event) => (
                            <div
                                key={event.id}
                                className={
                                    event.value > 0
                                        ? "piano-roll-sustain-marker on"
                                        : "piano-roll-sustain-marker off"
                                }
                                onDoubleClick={(e) => deleteSustainEvent(e, event.id)}
                                onPointerEnter={() => setIsSustainMarkerHovered(true)}
                                onPointerLeave={() => setIsSustainMarkerHovered(false)}
                                title={event.value > 0 ? "서스테인 ON" : "서스테인 OFF"}
                                style={{
                                    left:
                                        tickToX(event.tick, ticksPerBeat, beatWidth) -
                                        TEMPO_MARKER_WIDTH / 2,
                                    top: 3,
                                    height: Math.max(4, eventLaneHeight - 6),
                                }}
                            />
                        ))}
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

function snapTickToGrid(tick: number, ticksPerBeat: number, subdivision: number) {
    const roundedTick = Math.max(0, Math.round(tick));
    if (subdivision <= 0) return roundedTick;

    const unitTick = ticksPerBeat / subdivision;
    if (unitTick <= 0) return roundedTick;

    return Math.max(0, Math.round(Math.floor(tick / unitTick) * unitTick));
}

function getGridSubdivisionForNoteDenominator(denominator: number) {
    switch (denominator) {
        case 8:
            return 2;
        case 16:
            return 4;
        case 32:
            return 8;
        default:
            return 1;
    }
}

function getPaletteNoteDurationTick(denominator: number, ticksPerBeat: number) {
    return Math.max(1, Math.round(ticksPerBeat * 4 / denominator));
}

function createVelocityLabelViews(
    notes: PianoRollNoteView[],
    selectedChordId: string | null,
): PianoRollVelocityLabelView[] {
    if (selectedChordId == null) return [];

    const selectedNotes = notes.filter((note) => note.chordId === selectedChordId);
    const result: PianoRollVelocityLabelView[] = [];
    let previousVelocity: number | null = null;

    for (const note of selectedNotes) {
        const velocity = normalizeVelocityForLabel(note.velocity);
        if (previousVelocity !== velocity) {
            result.push({
                key: note.id,
                midi: note.midi,
                tick: note.startTick,
                velocity,
            });
        }

        previousVelocity = velocity;
    }

    return result;
}

function createVelocityGraphSegments(
    notes: PianoRollNoteView[],
    selectedChordId: string | null,
    selectedSectionId: string | null,
    sections: Array<{ id: string; sustain: SustainEvent[] }>,
    contentBeatCount: number,
    ticksPerBeat: number,
    beatWidth: number,
    laneHeight: number,
): PianoRollVelocityGraphSegment[] {
    if (selectedChordId == null) return [];

    const selectedNotes = notes.filter((note) => note.chordId === selectedChordId);
    if (selectedNotes.length === 0) return [];

    const velocityChanges: PianoRollVelocityGraphPoint[] = [];
    let previousVelocity: number | null = null;

    for (const note of selectedNotes) {
        const velocity = normalizeVelocityForLabel(note.velocity);
        if (previousVelocity !== velocity) {
            velocityChanges.push({
                tick: note.startTick,
                velocity,
            });
        }

        previousVelocity = velocity;
    }

    const startTick = velocityChanges[0]?.tick ?? 0;
    const endTick = Math.max(contentBeatCount * ticksPerBeat, selectedNotes.at(-1)?.startTick ?? 0);
    const sustainEvents = selectedSectionId == null
        ? []
        : sections.find((section) => section.id === selectedSectionId)?.sustain ?? [];
    const breakTicks = new Set<number>([startTick, endTick]);

    for (const change of velocityChanges) {
        if (change.tick >= startTick && change.tick <= endTick) {
            breakTicks.add(change.tick);
        }
    }

    for (const sustain of sustainEvents) {
        if (sustain.tick >= startTick && sustain.tick <= endTick) {
            breakTicks.add(sustain.tick);
        }
    }

    const ticks = [...breakTicks].sort((a, b) => a - b);
    const segments: PianoRollVelocityGraphSegment[] = [];

    for (let index = 0; index < ticks.length - 1; index += 1) {
        const tick = ticks[index];
        const nextTick = ticks[index + 1];
        const velocity = getVelocityAtTick(velocityChanges, tick);
        const nextVelocity = getVelocityAtTick(velocityChanges, nextTick);
        const sustained = isSustainOnAtTick(sustainEvents, tick);
        const x = tickToX(tick, ticksPerBeat, beatWidth);
        const nextX = tickToX(nextTick, ticksPerBeat, beatWidth);
        const y = velocityToGraphY(velocity, laneHeight);
        const nextY = velocityToGraphY(nextVelocity, laneHeight);

        segments.push({
            key: `h-${tick}-${nextTick}`,
            points: `${x},${y} ${nextX},${y}`,
            sustained,
        });

        if (nextVelocity !== velocity) {
            segments.push({
                key: `v-${nextTick}`,
                points: `${nextX},${y} ${nextX},${nextY}`,
                sustained: isSustainOnAtTick(sustainEvents, nextTick),
            });
        }
    }

    return segments;
}

function getVelocityAtTick(points: PianoRollVelocityGraphPoint[], tick: number) {
    let velocity = points[0]?.velocity ?? 8;

    for (const point of points) {
        if (point.tick > tick) break;
        velocity = point.velocity;
    }

    return velocity;
}

function isSustainOnAtTick(events: SustainEvent[], tick: number) {
    let value = 0;

    for (const event of [...events].sort((a, b) => a.tick - b.tick)) {
        if (event.tick > tick) break;
        value = event.value;
    }

    return value > 0;
}

function getSustainValueBeforeTick(events: SustainEvent[], tick: number) {
    let value = 0;

    for (const event of [...events].sort((a, b) => a.tick - b.tick)) {
        if (event.tick >= tick) break;
        value = event.value;
    }

    return value;
}

function velocityToGraphY(velocity: number, laneHeight: number) {
    const topPadding = 3;
    const bottomPadding = 3;
    const graphHeight = Math.max(1, laneHeight - topPadding - bottomPadding);

    return topPadding + (15 - velocity) / 15 * graphHeight;
}

function normalizeVelocityForLabel(value: number | undefined) {
    if (value == null || !Number.isFinite(value)) return 8;

    return Math.max(0, Math.min(15, Math.round(value)));
}

function getPreviousVelocityForTick(notes: NoteEvent[], tick: number) {
    const previousNote = [...notes]
        .filter((note) => note.tick <= tick)
        .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch)
        .at(-1);

    return normalizeVelocityForLabel(previousNote?.velocity);
}

function getDraftDurationTick(startTick: number, currentTick: number, unitTick: number) {
    if (currentTick < startTick) return 0;

    return Math.max(unitTick, (Math.floor((currentTick - startTick) / unitTick) + 1) * unitTick);
}

function getResizeDurationTick(
    originalDurationTick: number,
    startPointerTick: number,
    currentTick: number,
    unitTick: number,
) {
    const deltaTick = currentTick - startPointerTick;
    const deltaUnitCount = Math.floor(deltaTick / unitTick);

    return originalDurationTick + deltaUnitCount * unitTick;
}

function findSelectedOrSelectableNoteAtPoint(
    notes: PianoRollNoteView[],
    x: number,
    y: number,
    rows: PianoRollRow[],
    rowHeight: number,
    ticksPerBeat: number,
    beatWidth: number,
    selectedSectionId: string | null,
    selectedChordId: string | null,
    selectedNoteId: string | null,
) {
    const candidates = getSelectableNoteCandidatesAtPoint(
        notes,
        x,
        y,
        rows,
        rowHeight,
        ticksPerBeat,
        beatWidth,
        selectedSectionId,
        selectedChordId,
    );

    return candidates.find((note) => note.id === selectedNoteId) ?? candidates[0] ?? null;
}

function getSelectableNoteCandidatesAtPoint(
    notes: PianoRollNoteView[],
    x: number,
    y: number,
    rows: PianoRollRow[],
    rowHeight: number,
    ticksPerBeat: number,
    beatWidth: number,
    selectedSectionId: string | null,
    selectedChordId: string | null,
) {
    return notes.filter((note) =>
        isPointInsideNote(note, x, y, rows, rowHeight, ticksPerBeat, beatWidth),
    ).sort(
        (a, b) =>
            getNoteSelectionPriority(a, selectedSectionId, selectedChordId) -
            getNoteSelectionPriority(b, selectedSectionId, selectedChordId),
    );
}

function isPointInsideNote(
    note: PianoRollNoteView,
    x: number,
    y: number,
    rows: PianoRollRow[],
    rowHeight: number,
    ticksPerBeat: number,
    beatWidth: number,
) {
    const noteY = noteToY(note.midi, rows, rowHeight);
    if (noteY == null) return false;

    const left = tickToX(note.startTick, ticksPerBeat, beatWidth);
    const right = left + Math.max(tickToWidth(note.durationTick, ticksPerBeat, beatWidth), 4);
    const top = noteY + 2;
    const bottom = top + Math.max(rowHeight - 4, 4);

    return x >= left && x <= right && y >= top && y <= bottom;
}

function getNoteSelectionPriority(
    note: PianoRollNoteView,
    selectedSectionId: string | null,
    selectedChordId: string | null,
) {
    if (selectedChordId != null && note.chordId === selectedChordId) return 0;
    if (selectedSectionId != null && note.sectionId === selectedSectionId) return 1;

    return 2;
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

function createSubdivisionViews(
    beats: PianoRollBeatView[],
    subdivision: number,
): PianoRollSubdivisionView[] {
    if (subdivision <= 1) return [];

    const result: PianoRollSubdivisionView[] = [];

    for (const beat of beats) {
        const unitBeatLength = beat.beatLength / subdivision;

        for (let index = 1; index < subdivision; index += 1) {
            const startBeat = beat.startBeat + unitBeatLength * index;

            result.push({
                key: `${beat.key}-${index}`,
                startBeat,
            });
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

type SeekScrollEventDetail = {
    source: "score" | "piano-roll";
    tick: number;
};

function dispatchSeekScrollEvent(source: SeekScrollEventDetail["source"], tick: number) {
    window.dispatchEvent(
        new CustomEvent<SeekScrollEventDetail>(SEEK_SCROLL_EVENT, {
            detail: { source, tick },
        }),
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
