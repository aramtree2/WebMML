import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    getArrangementControlState,
    selectChord,
    selectNote,
    subscribeArrangementControlState,
} from "../../../core/editor/arrangementControlStore";
import { playbackEngine, secondsToTick, tickToSeconds } from "../../../core/playback";
import { getWmlProject, subscribeWmlProject } from "../../../core/wml/wmlStore";
import { EventEditorFloatingWindow } from "../../eventEditor";
import type { EventEditorAnchor, EventEditorTarget } from "../../eventEditor";
import { wmlProjectToScoreModel } from "./scoreMapper";
import { renderScore } from "./vexflowRenderer";
import type { ScoreChordRegion, ScoreMeasureRegion } from "./vexflowRenderer";
import "./ScorePanel.css";

const DEFAULT_ZOOM = 0.5;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

export function ScorePanel() {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const scoreRef = useRef<HTMLDivElement | null>(null);
    const playbackHighlightRef = useRef<HTMLDivElement | null>(null);
    const measureRegionsRef = useRef<ScoreMeasureRegion[]>([]);
    const chordRegionsRef = useRef<ScoreChordRegion[]>([]);
    const zoomRef = useRef(DEFAULT_ZOOM);
    const pendingZoomAnchorRef = useRef<{
        logicalCenterX: number;
        logicalCenterY: number;
    } | null>(null);
    const selectionKeyRef = useRef<string | null>(null);
    const suppressedSelectionFocusRef = useRef<string | null>(null);
    const [project, setProject] = useState(() => getWmlProject());
    const [arrangementControls, setArrangementControls] = useState(() =>
        getArrangementControlState(),
    );
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [measureHeaderRegions, setMeasureHeaderRegions] = useState<ScoreMeasureRegion[]>(
        [],
    );
    const [currentTick, setCurrentTick] = useState(() =>
        secondsToTick(playbackEngine.getSnapshot().currentTime, getWmlProject().tempos),
    );
    const [editorTarget, setEditorTarget] = useState<EventEditorTarget | null>(null);
    const [editorAnchor, setEditorAnchor] = useState<EventEditorAnchor | null>(null);
    const [editorBounds, setEditorBounds] = useState<{ width: number; height: number } | null>(
        null,
    );

    const score = useMemo(
        () => wmlProjectToScoreModel(project, arrangementControls),
        [project, arrangementControls],
    );
    const handleSelectNote = useCallback(
        (selection: { sectionId: string; chordId: string; noteId: string }) => {
            suppressedSelectionFocusRef.current = getSelectionKey({
                selectedSectionId: selection.sectionId,
                selectedChordId: selection.chordId,
                selectedNoteId: selection.noteId,
            });
            selectNote(selection.sectionId, selection.chordId, selection.noteId);
        },
        [],
    );
    const handleEditNote = useCallback(
        (
            selection: { sectionId: string; chordId: string; noteId: string },
            event: MouseEvent,
        ) => {
            suppressedSelectionFocusRef.current = getSelectionKey({
                selectedSectionId: selection.sectionId,
                selectedChordId: selection.chordId,
                selectedNoteId: selection.noteId,
            });
            selectNote(selection.sectionId, selection.chordId, selection.noteId);

            const panelRect = panelRef.current?.getBoundingClientRect();

            setEditorTarget({
                type: "note",
                noteId: selection.noteId,
                sectionId: selection.sectionId,
                chordId: selection.chordId,
            });
            setEditorAnchor(
                panelRect
                    ? {
                          x: event.clientX - panelRect.left + 8,
                          y: event.clientY - panelRect.top + 8,
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
        },
        [],
    );
    const closeEventEditor = useCallback(() => {
        setEditorTarget(null);
    }, []);
    const handleSurfaceClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".score-note-hit-target")) {
                return;
            }

            const scrollArea = scrollRef.current;
            if (!scrollArea) return;

            const rect = scrollArea.getBoundingClientRect();
            const logicalX =
                (event.clientX - rect.left + scrollArea.scrollLeft) / zoomRef.current;
            const logicalY =
                (event.clientY - rect.top + scrollArea.scrollTop) / zoomRef.current;
            const region = findMeasureRegionAtX(measureRegionsRef.current, logicalX);
            const chordRegion = findChordRegionAtY(chordRegionsRef.current, logicalY);

            if (!region) return;

            playbackEngine.seek(tickToSeconds(region.startTick, getWmlProject().tempos));
            dispatchSeekScrollEvent("score", region.startTick);

            if (chordRegion) {
                suppressedSelectionFocusRef.current = getSelectionKey({
                    selectedSectionId: chordRegion.sectionId,
                    selectedChordId: chordRegion.chordId,
                    selectedNoteId: null,
                });
                selectChord(chordRegion.sectionId, chordRegion.chordId);
            }
        },
        [],
    );

    useEffect(() => subscribeWmlProject(setProject), []);
    useEffect(() => subscribeArrangementControlState(setArrangementControls), []);
    useEffect(
        () =>
            playbackEngine.subscribe((snapshot) => {
                const nextTick = secondsToTick(snapshot.currentTime, getWmlProject().tempos);

                setCurrentTick(nextTick);
                updatePlaybackHighlight(
                    playbackHighlightRef.current,
                    scrollRef.current,
                    measureRegionsRef.current,
                    nextTick,
                    zoomRef.current,
                    snapshot.state === "playing",
                );
            }),
        [],
    );

    useEffect(() => {
        const container = scoreRef.current;
        const scrollArea = scrollRef.current;
        if (!container) return;

        const previousScrollLeft = scrollArea?.scrollLeft ?? 0;
        const previousScrollTop = scrollArea?.scrollTop ?? 0;
        const previousSelectionKey = selectionKeyRef.current;
        const nextSelectionKey = getSelectionKey(arrangementControls);
        let selectionChanged = previousSelectionKey !== nextSelectionKey;
        const result = renderScore(
            container,
            score,
            arrangementControls,
            zoom,
            handleSelectNote,
            handleEditNote,
        );
        measureRegionsRef.current = result.measureRegions;
        chordRegionsRef.current = result.chordRegions;
        setMeasureHeaderRegions(result.measureRegions);
        updatePlaybackHighlight(
            playbackHighlightRef.current,
            scrollArea,
            measureRegionsRef.current,
            secondsToTick(playbackEngine.getSnapshot().currentTime, project.tempos),
            zoom,
            playbackEngine.getSnapshot().state === "playing",
        );
        const suppressedSelectionFocus =
            suppressedSelectionFocusRef.current === nextSelectionKey;

        if (suppressedSelectionFocus) {
            selectionChanged = false;
            suppressedSelectionFocusRef.current = null;
        }

        const anchor = pendingZoomAnchorRef.current;
        if (scrollArea && anchor) {
            scrollArea.scrollLeft = anchor.logicalCenterX * zoom - scrollArea.clientWidth / 2;
            scrollArea.scrollTop = anchor.logicalCenterY * zoom - scrollArea.clientHeight / 2;
            pendingZoomAnchorRef.current = null;
        } else if (
            scrollArea &&
            selectionChanged &&
            result.selectedCenterY != null
        ) {
            if (
                isSelectionVisible({
                    centerX: result.selectedCenterX,
                    centerY: result.selectedCenterY,
                    scrollArea,
                    zoom,
                })
            ) {
                scrollArea.scrollLeft = previousScrollLeft;
                scrollArea.scrollTop = previousScrollTop;
            } else {
                scrollArea.scrollLeft = result.selectedCenterX == null
                    ? previousScrollLeft
                    : result.selectedCenterX * zoom - scrollArea.clientWidth / 2;
                scrollArea.scrollTop = result.selectedCenterY * zoom - scrollArea.clientHeight / 2;
            }
        } else if (scrollArea) {
            scrollArea.scrollLeft = previousScrollLeft;
            scrollArea.scrollTop = previousScrollTop;
        }

        selectionKeyRef.current = nextSelectionKey;
        zoomRef.current = zoom;
    }, [
        arrangementControls,
        handleEditNote,
        handleSelectNote,
        project.tempos,
        score,
        zoom,
    ]);

    useEffect(() => {
        const scrollArea = scrollRef.current;
        if (!scrollArea) return;

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();

            if (!event.ctrlKey) {
                scrollArea.scrollLeft += event.deltaY + event.deltaX;
                return;
            }

            const direction = event.deltaY > 0 ? -1 : 1;
            const currentZoom = zoomRef.current;

            pendingZoomAnchorRef.current = {
                logicalCenterX:
                    (scrollArea.scrollLeft + scrollArea.clientWidth / 2) / currentZoom,
                logicalCenterY:
                    (scrollArea.scrollTop + scrollArea.clientHeight / 2) / currentZoom,
            };

            setZoom((prev) =>
                clampZoom(prev + direction * ZOOM_STEP),
            );
        };

        scrollArea.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
            scrollArea.removeEventListener("wheel", handleWheel);
        };
    }, []);

    useEffect(() => {
        const handleSeekScroll = (event: Event) => {
            const scrollArea = scrollRef.current;
            const customEvent = event as CustomEvent<SeekScrollEventDetail>;
            const detail = customEvent.detail;
            if (!scrollArea || detail?.source === "score") return;

            const region = measureRegionsRef.current.find(
                (item) => detail.tick >= item.startTick && detail.tick < item.endTick,
            );
            if (!region) return;

            scrollScoreRegionIntoView(scrollArea, region, zoomRef.current);
        };

        window.addEventListener(SEEK_SCROLL_EVENT, handleSeekScroll);

        return () => {
            window.removeEventListener(SEEK_SCROLL_EVENT, handleSeekScroll);
        };
    }, []);

    return (
        <div ref={panelRef} className="score-panel">
            <div ref={scrollRef} className="score-scroll" onClick={handleSurfaceClick}>
                <div className="score-surface">
                    <div
                        className="score-measure-header"
                        style={{
                            width: getMeasureHeaderWidth(measureHeaderRegions, zoom),
                        }}
                    >
                        {measureHeaderRegions.map((region) => (
                            <div
                                key={region.index}
                                className={[
                                    "score-measure-header-cell",
                                    currentTick >= region.startTick &&
                                    currentTick < region.endTick
                                        ? "is-current"
                                        : "",
                                ].join(" ")}
                                style={{
                                    left: region.x * zoom,
                                    width: region.width * zoom,
                                }}
                            >
                                {region.index + 1}
                            </div>
                        ))}
                    </div>
                    <div ref={playbackHighlightRef} className="score-playback-highlight" />
                    <div ref={scoreRef} className="score-render-layer" />
                </div>
            </div>
            <EventEditorFloatingWindow
                target={editorTarget}
                anchor={editorAnchor}
                bounds={editorBounds}
                project={project}
                onClose={closeEventEditor}
            />
        </div>
    );
}

function clampZoom(value: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function getSelectionKey({
    selectedSectionId,
    selectedChordId,
    selectedNoteId,
}: {
    selectedSectionId: string | null;
    selectedChordId: string | null;
    selectedNoteId: string | null;
}) {
    return `${selectedSectionId ?? ""}:${selectedChordId ?? ""}:${selectedNoteId ?? ""}`;
}

function isSelectionVisible({
    centerX,
    centerY,
    scrollArea,
    zoom,
}: {
    centerX: number | null;
    centerY: number;
    scrollArea: HTMLDivElement;
    zoom: number;
}) {
    const y = centerY * zoom;
    const isVerticallyVisible =
        y >= scrollArea.scrollTop &&
        y <= scrollArea.scrollTop + scrollArea.clientHeight;

    if (!isVerticallyVisible) return false;
    if (centerX == null) return true;

    const x = centerX * zoom;

    return x >= scrollArea.scrollLeft &&
        x <= scrollArea.scrollLeft + scrollArea.clientWidth;
}

function updatePlaybackHighlight(
    highlight: HTMLDivElement | null,
    scrollArea: HTMLDivElement | null,
    regions: ScoreMeasureRegion[],
    currentTick: number,
    zoom: number,
    followPlayback: boolean,
) {
    if (!highlight) return;

    const region = regions.find(
        (item) => currentTick >= item.startTick && currentTick < item.endTick,
    );

    if (!region) {
        highlight.style.display = "none";
        return;
    }

    highlight.style.display = "block";
    highlight.style.left = `${region.x * zoom}px`;
    highlight.style.top = "0px";
    highlight.style.width = `${region.width * zoom}px`;
    highlight.style.height = `${region.height * zoom}px`;

    if (!followPlayback || !scrollArea) return;

    scrollPlaybackRegionIntoView(scrollArea, region, zoom);
}

function scrollPlaybackRegionIntoView(
    scrollArea: HTMLDivElement,
    region: ScoreMeasureRegion,
    zoom: number,
) {
    const regionLeft = region.x * zoom;
    const regionRight = regionLeft + region.width * zoom;
    const leftBoundary = scrollArea.scrollLeft + scrollArea.clientWidth * 0.15;
    const rightBoundary = scrollArea.scrollLeft + scrollArea.clientWidth * 0.75;
    let nextScrollLeft = scrollArea.scrollLeft;

    if (regionRight > rightBoundary) {
        nextScrollLeft = regionLeft - scrollArea.clientWidth * 0.35;
    } else if (regionLeft < leftBoundary) {
        nextScrollLeft = regionLeft - scrollArea.clientWidth * 0.2;
    }

    const maxScrollLeft = Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth);
    const clampedScrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));

    if (Math.abs(clampedScrollLeft - scrollArea.scrollLeft) > 1) {
        scrollArea.scrollLeft = clampedScrollLeft;
    }
}

function scrollScoreRegionIntoView(
    scrollArea: HTMLDivElement,
    region: ScoreMeasureRegion,
    zoom: number,
) {
    const regionLeft = region.x * zoom;
    const regionRight = regionLeft + region.width * zoom;
    const viewportLeft = scrollArea.scrollLeft;
    const viewportRight = viewportLeft + scrollArea.clientWidth;

    if (regionLeft >= viewportLeft && regionRight <= viewportRight) return;

    const nextScrollLeft = regionLeft + region.width * zoom / 2 - scrollArea.clientWidth / 2;
    const maxScrollLeft = Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth);

    scrollArea.scrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));
}

function findMeasureRegionAtX(regions: ScoreMeasureRegion[], logicalX: number) {
    if (regions.length === 0) return null;

    const directHit = regions.find(
        (item) => logicalX >= item.x && logicalX < item.x + item.width,
    );
    if (directHit) return directHit;

    const firstRegion = regions[0];
    const lastRegion = regions[regions.length - 1];

    if (logicalX < firstRegion.x) return firstRegion;
    if (logicalX >= lastRegion.x + lastRegion.width) return lastRegion;

    return regions.reduce((closest, region) => {
        const distance = Math.min(
            Math.abs(logicalX - region.x),
            Math.abs(logicalX - (region.x + region.width)),
        );
        const closestDistance = Math.min(
            Math.abs(logicalX - closest.x),
            Math.abs(logicalX - (closest.x + closest.width)),
        );

        return distance < closestDistance ? region : closest;
    }, firstRegion);
}

function findChordRegionAtY(regions: ScoreChordRegion[], logicalY: number) {
    return regions.find(
        (region) => logicalY >= region.top && logicalY <= region.bottom,
    ) ?? null;
}

function getMeasureHeaderWidth(regions: ScoreMeasureRegion[], zoom: number) {
    const lastRegion = regions.at(-1);
    if (!lastRegion) return "100%";

    return lastRegion.x * zoom + lastRegion.width * zoom;
}

const SEEK_SCROLL_EVENT = "webmml:seek-scroll";

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
