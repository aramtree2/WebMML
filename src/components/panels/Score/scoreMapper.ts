import type { ArrangementControlState } from "../../../core/editor/arrangementControlStore";
import { WML_TICKS_PER_QUARTER } from "../../../core/wml/wmlUtils";
import type {
    Chord,
    NoteEvent,
    TempoEvent,
    TimeSignatureEvent,
    WmlProject,
    WmlSection,
} from "../../../core/wml/wmlTypes";

export type ScoreDurationSymbol = "w" | "h" | "q" | "8" | "16" | "32";

export type ScoreEvent = {
    type: "note" | "rest";
    tick: number;
    durationTick: number;
    duration: ScoreDurationSymbol;
    dots: number;
    keys: string[];
    pitches: number[];
    noteIds: string[];
    chordId: string | null;
    sectionId: string | null;
};

export type ScoreMeasure = {
    index: number;
    startTick: number;
    durationTick: number;
    numerator: number;
    denominator: number;
    showTimeSignature: boolean;
    isTrailingMeasure: boolean;
    events: ScoreEvent[];
};

export type ScoreStaff = {
    id: string;
    measures: ScoreMeasure[];
};

export type ScoreChordGroup = {
    id: string;
    dynamics: ScoreDynamicMark[];
    staves: ScoreStaff[];
};

export type ScoreSection = {
    id: string;
    name: string;
    chordGroups: ScoreChordGroup[];
};

export type ScoreModel = {
    ticksPerBeat: number;
    measureCount: number;
    tempos: ScoreTempoMark[];
    sections: ScoreSection[];
};

export type ScoreTempoMark = {
    tick: number;
    bpm: number;
};

export type ScoreDynamicMark = {
    tick: number;
    text: ScoreDynamicText;
};

export type ScoreDynamicText = "pp" | "mp" | "mf" | "f" | "ff";

type NoteCluster = {
    tick: number;
    duration: number;
    notes: NoteEvent[];
};

type StaffLane = {
    clusters: NoteCluster[];
    endTick: number;
};

const DEFAULT_NUMERATOR = 4;
const DEFAULT_DENOMINATOR = 4;

const DURATION_FACTORS: Array<{
    duration: ScoreDurationSymbol;
    beats: number;
    dots: number;
}> = [
    { duration: "w", beats: 6, dots: 1 },
    { duration: "w", beats: 4, dots: 0 },
    { duration: "h", beats: 3, dots: 1 },
    { duration: "h", beats: 2, dots: 0 },
    { duration: "q", beats: 1.5, dots: 1 },
    { duration: "q", beats: 1, dots: 0 },
    { duration: "8", beats: 0.75, dots: 1 },
    { duration: "8", beats: 0.5, dots: 0 },
    { duration: "16", beats: 0.375, dots: 1 },
    { duration: "16", beats: 0.25, dots: 0 },
    { duration: "32", beats: 0.1875, dots: 1 },
    { duration: "32", beats: 0.125, dots: 0 },
];

export function wmlProjectToScoreModel(
    project: WmlProject,
    controls?: ArrangementControlState,
): ScoreModel {
    const visibleSections = project.sections.filter((section) =>
        isSectionVisible(section, controls),
    );
    const lastTick = getLastVisibleTick(visibleSections, controls);
    const measureSpecs = createMeasureSpecs(project.timeSignatures, lastTick);

    return {
        ticksPerBeat: WML_TICKS_PER_QUARTER,
        measureCount: measureSpecs.length,
        tempos: createTempoMarks(project.tempos),
        sections: visibleSections.map((section) =>
            createScoreSection(section, measureSpecs, controls),
        ),
    };
}

function createScoreSection(
    section: WmlSection,
    measureSpecs: ScoreMeasureSpec[],
    controls?: ArrangementControlState,
): ScoreSection {
    return {
        id: section.id,
        name: section.name,
        chordGroups: section.chords
            .filter((chord) => isChordVisible(chord, controls))
            .map((chord) => createScoreChordGroup(section, chord, measureSpecs)),
    };
}

function createScoreChordGroup(
    section: WmlSection,
    chord: Chord,
    measureSpecs: ScoreMeasureSpec[],
): ScoreChordGroup {
    const clusters = createNoteClusters(chord.notes);
    const lanes = splitClustersToLanes(clusters);

    return {
        id: chord.id,
        dynamics: createDynamicMarks(chord.notes),
        staves: (lanes.length > 0 ? lanes : [{ clusters: [], endTick: 0 }]).map(
            (lane, index) => ({
                id: `${chord.id}:${index}`,
                measures: createMeasuresForLane(
                    section.id,
                    chord.id,
                    lane,
                    measureSpecs,
                ),
            }),
        ),
    };
}

function createTempoMarks(tempos: TempoEvent[]): ScoreTempoMark[] {
    return [...tempos]
        .sort((a, b) => a.tick - b.tick)
        .map((tempo) => ({
            tick: quantizeTick(tempo.tick),
            bpm: tempo.bpm,
        }));
}

function createDynamicMarks(notes: NoteEvent[]): ScoreDynamicMark[] {
    const byTick = new Map<number, number>();

    notes.forEach((note) => {
        const tick = quantizeTick(note.tick);
        const velocity = normalizeVelocity(note.velocity);

        byTick.set(tick, Math.max(byTick.get(tick) ?? 0, velocity));
    });

    const marks: ScoreDynamicMark[] = [];
    let previousText: ScoreDynamicText | null = null;

    [...byTick.entries()]
        .sort(([tickA], [tickB]) => tickA - tickB)
        .forEach(([tick, velocity]) => {
            const text = velocityToDynamicText(velocity);

            if (text === previousText) return;

            marks.push({ tick, text });
            previousText = text;
        });

    return marks;
}

function normalizeVelocity(value: number) {
    return Math.max(0, Math.min(15, Math.round(value)));
}

function velocityToDynamicText(velocity: number): ScoreDynamicText {
    if (velocity <= 3) return "pp";
    if (velocity <= 7) return "mp";
    if (velocity <= 11) return "mf";
    if (velocity <= 13) return "f";

    return "ff";
}

function createMeasuresForLane(
    sectionId: string,
    chordId: string,
    lane: StaffLane,
    measureSpecs: ScoreMeasureSpec[],
) {
    const measures = measureSpecs.map((measure): ScoreMeasure => ({
        ...measure,
        events: [],
    }));
    let cursorTick = 0;

    lane.clusters.forEach((cluster) => {
        appendRestRange(measures, sectionId, chordId, cursorTick, cluster.tick);
        appendNoteRange(measures, sectionId, chordId, cluster);
        cursorTick = cluster.tick + cluster.duration;
    });

    appendRestRange(measures, sectionId, chordId, cursorTick, getScoreEndTick(measures));
    ensureTrailingMeasureRest(measures, sectionId, chordId);

    return measures;
}

function createNoteClusters(notes: NoteEvent[]) {
    const grouped = new Map<string, NoteCluster>();

    notes.forEach((note) => {
        const tick = quantizeTick(note.tick);
        const duration = Math.max(quantizeTick(note.duration), getDurationTick("32"));
        const key = `${tick}:${duration}`;
        const existing = grouped.get(key);

        if (existing) {
            existing.notes.push(note);
            return;
        }

        grouped.set(key, {
            tick,
            duration,
            notes: [note],
        });
    });

    return [...grouped.values()].sort(
        (a, b) => a.tick - b.tick || b.duration - a.duration,
    );
}

function splitClustersToLanes(clusters: NoteCluster[]) {
    const lanes: StaffLane[] = [];

    clusters.forEach((cluster) => {
        const lane = lanes.find((candidate) => candidate.endTick <= cluster.tick);

        if (lane) {
            lane.clusters.push(cluster);
            lane.endTick = cluster.tick + cluster.duration;
            return;
        }

        lanes.push({
            clusters: [cluster],
            endTick: cluster.tick + cluster.duration,
        });
    });

    return lanes;
}

function appendNoteRange(
    measures: ScoreMeasure[],
    sectionId: string,
    chordId: string,
    cluster: NoteCluster,
) {
    const endTick = cluster.tick + cluster.duration;
    let cursorTick = cluster.tick;

    while (cursorTick < endTick) {
        const measure = getMeasureAtTick(measures, cursorTick);
        if (!measure) return;

        const measureEndTick = measure.startTick + measure.durationTick;
        const segmentEndTick = Math.min(endTick, measureEndTick);

        appendSplitDurations({
            measures,
            startTick: cursorTick,
            durationTick: segmentEndTick - cursorTick,
            createEvent: (tick, durationTick, duration) => ({
                type: "note",
                tick,
                durationTick,
                duration: duration.duration,
                dots: duration.dots,
                keys: cluster.notes.map((note) => midiToVexflowKey(note.pitch)),
                pitches: cluster.notes.map((note) => note.pitch),
                noteIds: cluster.notes.map((note) => note.id),
                chordId,
                sectionId,
            }),
        });

        cursorTick = segmentEndTick;
    }
}

function appendRestRange(
    measures: ScoreMeasure[],
    sectionId: string,
    chordId: string,
    startTick: number,
    endTick: number,
) {
    appendSplitDurations({
        measures,
        startTick,
        durationTick: Math.max(0, endTick - startTick),
        createEvent: (tick, durationTick, duration) => ({
            type: "rest",
            tick,
            durationTick,
            duration: duration.duration,
            dots: duration.dots,
            keys: [],
            pitches: [],
            noteIds: [],
            chordId,
            sectionId,
        }),
    });
}

function appendSplitDurations({
    measures,
    startTick,
    durationTick,
    createEvent,
}: {
    measures: ScoreMeasure[];
    startTick: number;
    durationTick: number;
    createEvent: (
        tick: number,
        durationTick: number,
        duration: ScoreDurationCandidate,
    ) => ScoreEvent;
}) {
    let remainingTick = quantizeTick(durationTick);
    let cursorTick = quantizeTick(startTick);

    while (remainingTick > 0) {
        const measure = getMeasureAtTick(measures, cursorTick);
        if (!measure) return;

        const availableInMeasure = measure.startTick + measure.durationTick - cursorTick;
        const duration = pickDuration(Math.min(remainingTick, availableInMeasure));
        const eventDurationTick = getDurationTick(duration.duration, duration.dots);

        measure.events.push(createEvent(cursorTick, eventDurationTick, duration));
        cursorTick += eventDurationTick;
        remainingTick -= eventDurationTick;
    }
}

function getLastVisibleTick(
    sections: WmlSection[],
    controls?: ArrangementControlState,
) {
    return sections.reduce((sectionMax, section) => {
        return Math.max(
            sectionMax,
            ...section.chords
                .filter((chord) => isChordVisible(chord, controls))
                .flatMap((chord) => chord.notes)
                .map((note) => note.tick + Math.max(note.duration, 0)),
        );
    }, 0);
}

function isSectionVisible(
    section: WmlSection,
    controls?: ArrangementControlState,
) {
    return controls?.sections[section.id]?.visible !== false &&
        section.chords.some((chord) => isChordVisible(chord, controls));
}

function isChordVisible(
    chord: Chord,
    controls?: ArrangementControlState,
) {
    return controls?.chords[chord.id]?.visible !== false;
}

function getMeasureAtTick(measures: ScoreMeasure[], tick: number) {
    return measures.find(
        (measure) =>
            tick >= measure.startTick &&
            tick < measure.startTick + measure.durationTick,
    ) ?? null;
}

type ScoreMeasureSpec = Omit<ScoreMeasure, "events">;

function createMeasureSpecs(
    timeSignatures: TimeSignatureEvent[],
    lastTick: number,
): ScoreMeasureSpec[] {
    const normalizedTimeSignatures = normalizeTimeSignatures(timeSignatures);
    const specs: ScoreMeasureSpec[] = [];
    let startTick = 0;
    let index = 0;
    const trailingMeasure = getTrailingMeasureBounds(
        normalizedTimeSignatures,
        lastTick,
    );

    do {
        const signature = getActiveTimeSignature(normalizedTimeSignatures, index);
        const durationTick = getMeasureDurationTick(
            signature.numerator,
            signature.denominator,
        );
        const hasSignatureEvent = normalizedTimeSignatures.some(
            (event) => event.bar === index,
        );

        specs.push({
            index,
            startTick,
            durationTick,
            numerator: signature.numerator,
            denominator: signature.denominator,
            showTimeSignature: index === 0 || hasSignatureEvent,
            isTrailingMeasure: index === trailingMeasure.index,
        });

        startTick += durationTick;
        index += 1;
    } while (startTick < trailingMeasure.endTick);

    return specs;
}

function normalizeTimeSignatures(timeSignatures: TimeSignatureEvent[]) {
    const sorted = [...timeSignatures].sort((a, b) => a.bar - b.bar);
    const first = sorted[0];

    if (first?.bar === 0) return sorted;

    return [
        {
            id: "score-default-timesig",
            bar: 0,
            numerator: DEFAULT_NUMERATOR,
            denominator: DEFAULT_DENOMINATOR,
        },
        ...sorted,
    ];
}

function getActiveTimeSignature(
    timeSignatures: TimeSignatureEvent[],
    measureIndex: number,
) {
    let active = timeSignatures[0] ?? {
        id: "score-default-timesig",
        bar: 0,
        numerator: DEFAULT_NUMERATOR,
        denominator: DEFAULT_DENOMINATOR,
    };

    for (const event of timeSignatures) {
        if (event.bar > measureIndex) break;
        active = event;
    }

    return active;
}

function getMeasureDurationTick(numerator: number, denominator: number) {
    return WML_TICKS_PER_QUARTER * 4 * numerator / denominator;
}

function getTrailingMeasureBounds(
    timeSignatures: TimeSignatureEvent[],
    lastTick: number,
) {
    if (lastTick <= 0) {
        const signature = getActiveTimeSignature(timeSignatures, 0);

        return {
            index: 0,
            endTick: getMeasureDurationTick(
                signature.numerator,
                signature.denominator,
            ),
        };
    }

    const lastOccupiedTick = Math.max(0, lastTick - 1);
    let startTick = 0;
    let index = 0;

    while (true) {
        const signature = getActiveTimeSignature(timeSignatures, index);
        const durationTick = getMeasureDurationTick(
            signature.numerator,
            signature.denominator,
        );
        const endTick = startTick + durationTick;

        if (lastOccupiedTick < endTick) {
            const trailingIndex = index + 1;
            const trailingSignature = getActiveTimeSignature(
                timeSignatures,
                trailingIndex,
            );
            const trailingDurationTick = getMeasureDurationTick(
                trailingSignature.numerator,
                trailingSignature.denominator,
            );

            return {
                index: trailingIndex,
                endTick: endTick + trailingDurationTick,
            };
        }

        startTick = endTick;
        index += 1;
    }
}

function ensureTrailingMeasureRest(
    measures: ScoreMeasure[],
    sectionId: string,
    chordId: string,
) {
    const trailingMeasure = measures.find((measure) => measure.isTrailingMeasure);
    if (!trailingMeasure) return;

    trailingMeasure.events = [
        {
            type: "rest",
            tick: trailingMeasure.startTick,
            durationTick: trailingMeasure.durationTick,
            ...pickDuration(trailingMeasure.durationTick),
            keys: [],
            pitches: [],
            noteIds: [],
            chordId,
            sectionId,
        },
    ];
}

function getScoreEndTick(measures: ScoreMeasure[]) {
    const lastMeasure = measures.at(-1);

    return lastMeasure == null
        ? 0
        : lastMeasure.startTick + lastMeasure.durationTick;
}

type ScoreDurationCandidate = {
    duration: ScoreDurationSymbol;
    dots: number;
};

function pickDuration(ticks: number): ScoreDurationCandidate {
    const quantized = quantizeTick(ticks);

    return DURATION_FACTORS.find(
        (item) => getDurationTick(item.duration, item.dots) <= quantized,
    ) ?? { duration: "32", dots: 0 };
}

function getDurationTick(duration: ScoreDurationSymbol, dots = 0) {
    return WML_TICKS_PER_QUARTER *
        (DURATION_FACTORS.find(
            (item) => item.duration === duration && item.dots === dots,
        )?.beats ?? 1);
}

function quantizeTick(value: number) {
    const unit = getDurationTick("32", 0);

    return Math.max(0, Math.round(value / unit) * unit);
}

function midiToVexflowKey(midi: number) {
    const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    const octave = Math.floor(Math.round(midi) / 12) - 1;

    return `${names[pitchClass]}/${octave}`;
}
