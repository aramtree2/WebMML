import type { ArrangementControlState } from "../editor/arrangementControlStore";
import { barToTick } from "../wml/wmlUtils";
import type { WmlProject } from "../wml/wmlTypes";
import type { PlaybackEvent, PlaybackTimeline } from "./playbackTypes";
import { tickToSeconds } from "./tempoUtils";

const EVENT_ORDER: Record<PlaybackEvent["type"], number> = {
    noteOff: 0,
    sustain: 1,
    noteOn: 2,
};

export function buildPlaybackTimeline(
    project: WmlProject,
    controls?: ArrangementControlState,
): PlaybackTimeline {
    const events: PlaybackEvent[] = [];
    let durationTick = 0;
    let lastNoteEndTick = 0;

    for (const section of project.sections) {
        for (const chord of section.chords) {
            const chordMuted = controls?.chords[chord.id]?.mute === true;

            for (const note of chord.notes) {
                const startTick = Math.max(0, note.tick);
                const duration = Math.max(0, note.duration);
                const endTick = startTick + duration;

                durationTick = Math.max(durationTick, endTick);
                lastNoteEndTick = Math.max(lastNoteEndTick, endTick);

                if (chordMuted) continue;

                events.push({
                    id: `${note.id}-on`,
                    type: "noteOn",
                    sectionId: section.id,
                    chordId: chord.id,
                    noteId: note.id,
                    wmlInstrument: section.instrument,
                    tick: startTick,
                    time: tickToSeconds(startTick, project.tempos),
                    pitch: note.pitch,
                    velocity: clamp01(note.velocity),
                });

                events.push({
                    id: `${note.id}-off`,
                    type: "noteOff",
                    sectionId: section.id,
                    chordId: chord.id,
                    noteId: note.id,
                    wmlInstrument: section.instrument,
                    tick: endTick,
                    time: tickToSeconds(endTick, project.tempos),
                    pitch: note.pitch,
                });
            }
        }

        for (const sustain of section.sustain) {
            const tick = Math.max(0, sustain.tick);
            durationTick = Math.max(durationTick, tick);

            events.push({
                id: sustain.id,
                type: "sustain",
                sectionId: section.id,
                tick,
                time: tickToSeconds(tick, project.tempos),
                value: sustain.value,
            });
        }
    }

    events.sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        if (a.tick !== b.tick) return a.tick - b.tick;
        return EVENT_ORDER[a.type] - EVENT_ORDER[b.type];
    });

    if (lastNoteEndTick > 0) {
        durationTick = Math.max(
            durationTick,
            getFollowingBarEndTick(lastNoteEndTick, project.timeSignatures),
        );
    }

    return {
        durationTick,
        duration: tickToSeconds(durationTick, project.tempos),
        events,
    };
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.max(0, Math.min(1, value));
}

function getFollowingBarEndTick(tick: number, timeSignatures: WmlProject["timeSignatures"]) {
    let bar = 0;
    let barTick = 0;
    const targetTick = Math.max(0, Math.round(tick));

    while (barTick <= targetTick) {
        bar += 1;
        barTick = barToTick(bar, timeSignatures);
    }

    return barToTick(bar + 1, timeSignatures);
}
