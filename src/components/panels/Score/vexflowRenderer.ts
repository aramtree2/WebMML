import {
    Accidental,
    BarlineType,
    Dot,
    Formatter,
    Renderer,
    Stave,
    StaveConnector,
    StaveNote,
    StaveTie,
    Voice,
} from "vexflow";
import type { ArrangementControlState } from "../../../core/editor/arrangementControlStore";
import type {
    ScoreChordGroup,
    ScoreEvent,
    ScoreModel,
    ScoreSection,
    ScoreStaff,
} from "./scoreMapper";

const MEASURE_WIDTH = 190;
const FIRST_MEASURE_WIDTH = 250;
const MIN_EVENT_WIDTH = 34;
const ACCIDENTAL_WIDTH = 14;
const CHORD_TONE_WIDTH = 7;
const LEFT_MARGIN = 180;
const SECTION_LABEL_SHIFT_X = -8;
const TOP_MARGIN = 22;
const MIN_STAFF_TOP_GAP = 72;
const STAFF_BODY_HEIGHT = 40;
const MIN_STAFF_CLEARANCE = 18;
const CHORD_GROUP_GAP = 20;
const SECTION_GAP = 34;
const BOTTOM_MARGIN = 28;
const VIRTUAL_STAFF_PADDING = 82;
const BRACKET_CONNECTOR_X_OFFSET = -8;
const BRACE_CONNECTOR_X_OFFSET = -18;
const TREBLE_TOP_STAFF_PITCH = 77;
const TREBLE_BOTTOM_STAFF_PITCH = 64;
const STAFF_STEP_HEIGHT = 5;
const EXTRA_LEDGER_PADDING = 18;
const SELECTED_SECTION_COLOR = "#1d4ed8";
const SELECTED_CHORD_COLOR = "#c2410c";
const SELECTED_NOTE_COLOR = "#ec4899";

export type ScoreNoteSelection = {
    sectionId: string;
    chordId: string;
    noteId: string;
};

type RenderedScoreEvent = {
    event: ScoreEvent;
    note: StaveNote;
};

type RenderedStaff = {
    staff: ScoreStaff;
    staves: Stave[];
    topStave: Stave;
    bottomStave: Stave;
    renderedEvents: RenderedScoreEvent[];
};

type RenderedChordGroup = {
    chordGroup: ScoreChordGroup;
    topStave: Stave;
    bottomStave: Stave;
};

type RenderedSection = {
    section: ScoreSection;
    chordGroupCount: number;
    topStave: Stave;
    bottomStave: Stave;
};

type ScoreLayoutRow = {
    staff: ScoreStaff;
    y: number;
    above: number;
    below: number;
    renderedStaff?: RenderedStaff;
};

type ScoreChordGroupLayout = {
    chordGroup: ScoreChordGroup;
    rows: ScoreLayoutRow[];
};

type ScoreSectionLayout = {
    section: ScoreSection;
    chordGroups: ScoreChordGroupLayout[];
};

export type RenderScoreResult = {
    measureRegions: ScoreMeasureRegion[];
    chordRegions: ScoreChordRegion[];
    selectedCenterX: number | null;
    selectedCenterY: number | null;
};

export type ScoreMeasureRegion = {
    index: number;
    startTick: number;
    endTick: number;
    x: number;
    width: number;
    height: number;
};

export type ScoreChordRegion = {
    sectionId: string;
    chordId: string;
    top: number;
    bottom: number;
};

export function renderScore(
    container: HTMLDivElement,
    score: ScoreModel,
    selection: ArrangementControlState,
    zoom: number,
    onSelectNote?: (selection: ScoreNoteSelection) => void,
): RenderScoreResult {
    container.innerHTML = "";

    const layout = createVerticalLayout(score);
    const measureWidths = createMeasureWidths(score);
    const viewportWidth = container.parentElement?.clientWidth ?? container.clientWidth;
    const viewportHeight = container.parentElement?.clientHeight ?? container.clientHeight;
    const width = Math.max(viewportWidth / zoom, getScoreWidth(measureWidths));
    const height = Math.max(viewportHeight / zoom, layout.height);
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(width * zoom, height * zoom);

    const context = renderer.getContext();
    context.scale(zoom, zoom);

    const renderedEvents: RenderedScoreEvent[] = [];
    const renderedChordGroups: RenderedChordGroup[] = [];
    const renderedSections: RenderedSection[] = [];

    layout.rows.forEach((row) => {
        const renderedStaff = drawStaff({
            context,
            measureWidths,
            staff: row.staff,
            y: row.y,
            selection,
        });

        renderedEvents.push(...renderedStaff.renderedEvents);
        row.renderedStaff = renderedStaff;
    });

    layout.sections.forEach((sectionLayout) => {
        const firstStaff = sectionLayout.chordGroups[0]?.rows[0]?.renderedStaff;
        const lastStaff = sectionLayout.chordGroups.at(-1)?.rows.at(-1)?.renderedStaff;
        if (!firstStaff || !lastStaff) return;

        renderedSections.push({
            section: sectionLayout.section,
            chordGroupCount: sectionLayout.chordGroups.length,
            topStave: firstStaff.topStave,
            bottomStave: lastStaff.bottomStave,
        });

        sectionLayout.chordGroups.forEach((groupLayout) => {
            if (groupLayout.rows.length < 2) return;

            const topStaff = groupLayout.rows[0]?.renderedStaff;
            const bottomStaff = groupLayout.rows.at(-1)?.renderedStaff;
            if (!topStaff || !bottomStaff) return;

            renderedChordGroups.push({
                chordGroup: groupLayout.chordGroup,
                topStave: topStaff.topStave,
                bottomStave: bottomStaff.bottomStave,
            });
        });
    });

    drawConnectors(context, renderedSections, renderedChordGroups);
    drawTies(context, renderedEvents, selection);
    createNoteHitTargets(container, renderedEvents, zoom, onSelectNote);

    return {
        measureRegions: createMeasureRegions(score, measureWidths, height),
        chordRegions: createChordRegions(layout.sections),
        ...getSelectedCenter(layout.sections, renderedEvents, selection),
    };
}

function drawStaff({
    context,
    measureWidths,
    staff,
    y,
    selection,
}: {
    context: ReturnType<Renderer["getContext"]>;
    measureWidths: number[];
    staff: ScoreStaff;
    y: number;
    selection: ArrangementControlState;
}): RenderedStaff {
    const renderedEvents: RenderedScoreEvent[] = [];
    const staves: Stave[] = [];
    let x = LEFT_MARGIN;

    staff.measures.forEach((measure) => {
        const width = measureWidths[measure.index] ?? MEASURE_WIDTH;
        const stave = new Stave(x, y, width);
        const isLastMeasure = measure.index === staff.measures.length - 1;

        if (measure.index === 0) {
            stave.addClef("treble");
        }

        if (measure.showTimeSignature) {
            stave.addTimeSignature(`${measure.numerator}/${measure.denominator}`);
        }

        if (isLastMeasure) {
            stave.setEndBarType(BarlineType.END);
        }

        stave.setContext(context).draw();

        const events = measure.events.map((event) => ({
            event,
            note: createStaveNote(event, selection),
        }));
        const notes = events.map((event) => event.note);

        if (notes.length > 0) {
            const voice = new Voice({
                numBeats: measure.numerator,
                beatValue: measure.denominator,
            }).setMode(Voice.Mode.SOFT);

            voice.addTickables(notes);
            new Formatter().joinVoices([voice]).format([voice], width - 54);
            voice.draw(context, stave);
        }

        staves.push(stave);
        renderedEvents.push(...events);
        x += width;
    });

    return {
        staff,
        staves,
        topStave: staves[0],
        bottomStave: staves.at(-1) ?? staves[0],
        renderedEvents,
    };
}

function drawConnectors(
    context: ReturnType<Renderer["getContext"]>,
    sections: RenderedSection[],
    chordGroups: RenderedChordGroup[],
) {
    const firstSection = sections[0];
    const lastSection = sections.at(-1);

    if (firstSection && lastSection && firstSection.topStave !== lastSection.bottomStave) {
        new StaveConnector(firstSection.topStave, lastSection.bottomStave)
            .setType("singleLeft")
            .setContext(context)
            .draw();
    }

    sections.forEach((section) => {
        if (section.chordGroupCount > 1) {
            new StaveConnector(
                createOffsetStave(section.topStave, BRACKET_CONNECTOR_X_OFFSET),
                createOffsetStave(section.bottomStave, BRACKET_CONNECTOR_X_OFFSET),
            )
                .setType("bracket")
                .setContext(context)
                .draw();
        }

        new StaveConnector(section.topStave, section.bottomStave)
            .setType("none")
            .setText(section.section.name, { shiftX: SECTION_LABEL_SHIFT_X, shiftY: 4 })
            .setContext(context)
            .draw();
    });

    chordGroups.forEach((group) => {
        new StaveConnector(
            createOffsetStave(group.topStave, BRACE_CONNECTOR_X_OFFSET),
            createOffsetStave(group.bottomStave, BRACE_CONNECTOR_X_OFFSET),
        )
            .setType("brace")
            .setContext(context)
            .draw();
    });
}

function createOffsetStave(stave: Stave, offsetX: number): Stave {
    const offsetStave = Object.create(stave) as Stave;

    offsetStave.getX = () => stave.getX() + offsetX;

    return offsetStave;
}

function createStaveNote(
    event: ScoreEvent,
    selection: ArrangementControlState,
) {
    const note = new StaveNote({
        keys: event.type === "rest" ? ["b/4"] : event.keys,
        duration: event.type === "rest" ? `${event.duration}r` : event.duration,
        dots: event.dots,
        autoStem: true,
    });

    for (let index = 0; index < event.dots; index += 1) {
        Dot.buildAndAttach([note], { all: true });
    }

    if (event.type === "rest") {
        const selectionColor = getEventSelectionColor(event, selection);
        if (selectionColor != null) {
            note.setStyle({
                fillStyle: selectionColor,
                strokeStyle: selectionColor,
            });
            note.setKeyStyle(0, {
                fillStyle: selectionColor,
                strokeStyle: selectionColor,
            });
        }
    }

    if (event.type === "note") {
        event.keys.forEach((key, index) => {
            if (key.includes("#")) {
                note.addModifier(new Accidental("#"), index);
            }
        });

        const selectionColor = getEventSelectionColor(event, selection);
        if (selectionColor != null) {
            note.setStyle({
                fillStyle: selectionColor,
                strokeStyle: selectionColor,
            });
        }

        event.noteIds.forEach((noteId, index) => {
            const noteHeadColor = getNoteIdSelectionColor(noteId, event, selection);
            if (noteHeadColor == null) return;

            note.setKeyStyle(index, {
                fillStyle: noteHeadColor,
                strokeStyle: noteHeadColor,
            });
        });
    }

    return note;
}

function drawTies(
    context: ReturnType<Renderer["getContext"]>,
    renderedEvents: RenderedScoreEvent[],
    selection: ArrangementControlState,
) {
    renderedEvents.forEach((event, index) => {
        if (event.event.type !== "note") return;

        const nextEvent = renderedEvents
            .slice(index + 1)
            .find((candidate) => candidate.event.type === "note");

        if (!nextEvent) return;

        const tieIndexesByColor = new Map<
            string,
            { firstIndexes: number[]; lastIndexes: number[] }
        >();

        event.event.noteIds.forEach((noteId, firstIndex) => {
            const lastIndex = nextEvent.event.noteIds.indexOf(noteId);
            if (lastIndex < 0) return;

            const isContiguous =
                event.event.tick + event.event.durationTick === nextEvent.event.tick;
            if (!isContiguous) return;

            const selectionColor = getNoteIdSelectionColor(noteId, event.event, selection);
            if (selectionColor == null) return;

            const indexes = tieIndexesByColor.get(selectionColor) ?? {
                firstIndexes: [],
                lastIndexes: [],
            };

            indexes.firstIndexes.push(firstIndex);
            indexes.lastIndexes.push(lastIndex);
            tieIndexesByColor.set(selectionColor, indexes);
        });

        tieIndexesByColor.forEach(({ firstIndexes, lastIndexes }, selectionColor) => {
            if (firstIndexes.length === 0) return;

            const tie = new StaveTie({
                firstNote: event.note,
                lastNote: nextEvent.note,
                firstIndexes,
                lastIndexes,
            }).setContext(context);

            tie.setStyle({
                strokeStyle: selectionColor,
                fillStyle: selectionColor,
            });

            tie.draw();
        });
    });
}

function createNoteHitTargets(
    container: HTMLDivElement,
    renderedEvents: RenderedScoreEvent[],
    zoom: number,
    onSelectNote?: (selection: ScoreNoteSelection) => void,
) {
    if (!onSelectNote) return;

    renderedEvents.forEach(({ event, note }) => {
        if (
            event.type !== "note" ||
            event.sectionId == null ||
            event.chordId == null ||
            event.noteIds.length === 0
        ) {
            return;
        }

        const box = note.getBoundingBox();
        const hitTarget = document.createElement("button");
        hitTarget.type = "button";
        hitTarget.className = "score-note-hit-target";
        hitTarget.style.left = `${Math.max(0, box.getX() * zoom - 6)}px`;
        hitTarget.style.top = `${Math.max(0, box.getY() * zoom - 8)}px`;
        hitTarget.style.width = `${Math.max(20, box.getW() * zoom + 12)}px`;
        hitTarget.style.height = `${Math.max(20, box.getH() * zoom + 16)}px`;
        hitTarget.addEventListener("click", (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();

            onSelectNote({
                sectionId: event.sectionId!,
                chordId: event.chordId!,
                noteId: getClosestNoteId(container, event, note, zoom, clickEvent.clientY),
            });
        });

        container.appendChild(hitTarget);
    });
}

function getClosestNoteId(
    container: HTMLDivElement,
    event: ScoreEvent,
    note: StaveNote,
    zoom: number,
    clientY: number,
) {
    if (event.noteIds.length === 1) return event.noteIds[0];

    const containerTop = container.getBoundingClientRect().top;
    const localY = (clientY - containerTop) / zoom;
    const ys = note.getYs();
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    ys.forEach((y, index) => {
        const distance = Math.abs(y - localY);
        if (distance < closestDistance) {
            closestIndex = index;
            closestDistance = distance;
        }
    });

    return event.noteIds[closestIndex] ?? event.noteIds[0];
}

function createVerticalLayout(score: ScoreModel) {
    let y = TOP_MARGIN + VIRTUAL_STAFF_PADDING;
    let previousRow: ScoreLayoutRow | null = null;
    let pendingGroupGap = 0;
    const rows: ScoreLayoutRow[] = [];
    const sections: ScoreSectionLayout[] = score.sections.map((section) => {
        const chordGroups = section.chordGroups.map((chordGroup) => {
            const groupRows = chordGroup.staves.map((staff) => {
                const verticalSpace = estimateStaffVerticalSpace(staff);

                if (previousRow != null) {
                    const minimumGap = Math.max(
                        MIN_STAFF_TOP_GAP,
                        STAFF_BODY_HEIGHT +
                            previousRow.below +
                            verticalSpace.above +
                            MIN_STAFF_CLEARANCE,
                    );

                    y = previousRow.y + minimumGap + pendingGroupGap;
                    pendingGroupGap = 0;
                } else {
                    y += verticalSpace.above;
                }

                const row: ScoreLayoutRow = {
                    staff,
                    y,
                    above: verticalSpace.above,
                    below: verticalSpace.below,
                };

                rows.push(row);
                previousRow = row;
                return row;
            });

            pendingGroupGap = Math.max(pendingGroupGap, CHORD_GROUP_GAP);

            return {
                chordGroup,
                rows: groupRows,
            };
        });

        pendingGroupGap = Math.max(pendingGroupGap, SECTION_GAP);

        return {
            section,
            chordGroups,
        };
    });

    return {
        rows,
        sections,
        height: getLayoutHeight(rows),
    };
}

function getSelectedCenter(
    sections: ScoreSectionLayout[],
    renderedEvents: RenderedScoreEvent[],
    selection: ArrangementControlState,
) {
    if (selection.selectedNoteId != null) {
        const event = renderedEvents.find((candidate) =>
            candidate.event.noteIds.includes(selection.selectedNoteId!),
        );

        if (event) {
            const box = event.note.getBoundingBox();

            return {
                selectedCenterX: box.getX() + box.getW() / 2,
                selectedCenterY: box.getY() + box.getH() / 2,
            };
        }
    }

    if (selection.selectedChordId != null) {
        const chordGroup = sections
            .flatMap((section) => section.chordGroups)
            .find((group) => group.chordGroup.id === selection.selectedChordId);

        return {
            selectedCenterX: null,
            selectedCenterY: getRowsCenterY(chordGroup?.rows ?? []),
        };
    }

    if (selection.selectedSectionId != null) {
        const section = sections.find(
            (item) => item.section.id === selection.selectedSectionId,
        );
        const rows = section?.chordGroups.flatMap((group) => group.rows) ?? [];

        return {
            selectedCenterX: null,
            selectedCenterY: getRowsCenterY(rows),
        };
    }

    return {
        selectedCenterX: null,
        selectedCenterY: null,
    };
}

function getRowsCenterY(rows: ScoreLayoutRow[]) {
    const firstRow = rows[0];
    const lastRow = rows.at(-1);
    if (!firstRow || !lastRow) return null;

    return (firstRow.y + lastRow.y + STAFF_BODY_HEIGHT) / 2;
}

function getLayoutHeight(rows: ScoreLayoutRow[]) {
    const lastRow = rows.at(-1);
    if (!lastRow) {
        return TOP_MARGIN + VIRTUAL_STAFF_PADDING * 2 + STAFF_BODY_HEIGHT + BOTTOM_MARGIN;
    }

    return lastRow.y +
        STAFF_BODY_HEIGHT +
        lastRow.below +
        VIRTUAL_STAFF_PADDING +
        BOTTOM_MARGIN;
}

function estimateStaffVerticalSpace(staff: ScoreStaff) {
    const pitches = staff.measures.flatMap((measure) =>
        measure.events.flatMap((event) => event.pitches),
    );

    if (pitches.length === 0) {
        return {
            above: 0,
            below: 0,
        };
    }

    const highest = Math.max(...pitches);
    const lowest = Math.min(...pitches);

    return {
        above: estimatePitchOverflow(highest - TREBLE_TOP_STAFF_PITCH),
        below: estimatePitchOverflow(TREBLE_BOTTOM_STAFF_PITCH - lowest),
    };
}

function estimatePitchOverflow(semitones: number) {
    if (semitones <= 0) return 0;

    return Math.ceil(semitones / 2) * STAFF_STEP_HEIGHT + EXTRA_LEDGER_PADDING;
}

function getScoreWidth(measureWidths: number[]) {
    return LEFT_MARGIN * 2 + measureWidths.reduce((sum, width) => sum + width, 0);
}

function createMeasureWidths(score: ScoreModel) {
    return Array.from({ length: score.measureCount }, (_, measureIndex) => {
        const baseWidth = measureIndex === 0 ? FIRST_MEASURE_WIDTH : MEASURE_WIDTH;
        const requiredWidth = getRequiredMeasureWidth(score, measureIndex);

        return Math.max(baseWidth, requiredWidth);
    });
}

function createMeasureRegions(
    score: ScoreModel,
    measureWidths: number[],
    height: number,
): ScoreMeasureRegion[] {
    const firstStaff = score.sections[0]?.chordGroups[0]?.staves[0];
    if (!firstStaff) return [];

    let x = LEFT_MARGIN;

    return firstStaff.measures.map((measure) => {
        const width = measureWidths[measure.index] ?? MEASURE_WIDTH;
        const region = {
            index: measure.index,
            startTick: measure.startTick,
            endTick: measure.startTick + measure.durationTick,
            x,
            width,
            height,
        };

        x += width;

        return region;
    });
}

function createChordRegions(sections: ScoreSectionLayout[]): ScoreChordRegion[] {
    return sections.flatMap((section) =>
        section.chordGroups.flatMap((group) => {
            const firstRow = group.rows[0];
            const lastRow = group.rows.at(-1);
            if (!firstRow || !lastRow) return [];

            return {
                sectionId: section.section.id,
                chordId: group.chordGroup.id,
                top: firstRow.y - firstRow.above,
                bottom: lastRow.y + STAFF_BODY_HEIGHT + lastRow.below,
            };
        }),
    );
}

function getRequiredMeasureWidth(score: ScoreModel, measureIndex: number) {
    let maxStaffWidth = 0;

    score.sections.forEach((section) => {
        section.chordGroups.forEach((group) => {
            group.staves.forEach((staff) => {
                const measure = staff.measures[measureIndex];
                if (!measure) return;

                const eventWidth = measure.events.reduce(
                    (sum, event) => sum + estimateEventWidth(event),
                    0,
                );

                maxStaffWidth = Math.max(maxStaffWidth, eventWidth);
            });
        });
    });

    return maxStaffWidth + 68;
}

function estimateEventWidth(event: ScoreEvent) {
    if (event.type === "rest") {
        return MIN_EVENT_WIDTH;
    }

    const accidentalCount = event.keys.filter((key) => key.includes("#")).length;
    const chordToneCount = Math.max(0, event.keys.length - 1);

    return MIN_EVENT_WIDTH +
        accidentalCount * ACCIDENTAL_WIDTH +
        chordToneCount * CHORD_TONE_WIDTH +
        event.dots * 8;
}

function getEventSelectionColor(
    event: ScoreEvent,
    selection: ArrangementControlState,
) {
    if (
        selection.selectedNoteId != null &&
        event.noteIds.includes(selection.selectedNoteId)
    ) {
        return SELECTED_NOTE_COLOR;
    }

    if (selection.selectedChordId != null) {
        return event.chordId === selection.selectedChordId
            ? SELECTED_CHORD_COLOR
            : getSectionSelectionColor(event, selection);
    }

    return getSectionSelectionColor(event, selection);
}

function getNoteIdSelectionColor(
    noteId: string,
    event: ScoreEvent,
    selection: ArrangementControlState,
) {
    if (selection.selectedNoteId === noteId) {
        return SELECTED_NOTE_COLOR;
    }

    if (selection.selectedChordId != null && event.chordId === selection.selectedChordId) {
        return SELECTED_CHORD_COLOR;
    }

    return getSectionSelectionColor(event, selection);
}

function getSectionSelectionColor(
    event: ScoreEvent,
    selection: ArrangementControlState,
) {
    if (selection.selectedSectionId != null) {
        return event.sectionId === selection.selectedSectionId
            ? SELECTED_SECTION_COLOR
            : null;
    }

    return null;
}
