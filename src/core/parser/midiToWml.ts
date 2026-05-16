import { Midi } from "@tonejs/midi";
import type { WmlProject, WmlSection, NoteEvent } from "../wml/wmlTypes";
import { createId } from "../wml/wmlUtils";

const TARGET_PPQ = 480;

type MidiToWmlOptions = {
    title?: string;
    selectedInstruments?: Record<number, string | number>;
};

export function midiToWml(
    arrayBuffer: ArrayBuffer,
    options: MidiToWmlOptions = {}
): WmlProject {
    const midi = new Midi(arrayBuffer);

    const originalPPQ = midi.header.ppq || TARGET_PPQ;
    const ratio = TARGET_PPQ / originalPPQ;

    const project: WmlProject = {
        id: createId("project"),
        title: options.title ?? "Imported MIDI",
        tempos: [],
        timeSignatures: [],
        sections: [],
    };

    project.timeSignatures = midi.header.timeSignatures.map((ts) => ({
        id: createId("timesig"),
        tick: Math.round(ts.ticks * ratio),
        numerator: ts.timeSignature?.[0] ?? 4,
        denominator: ts.timeSignature?.[1] ?? 4,
    }));

    project.tempos = midi.header.tempos.map((t) => ({
        id: createId("tempo"),
        tick: Math.round(t.ticks * ratio),
        bpm: Math.round(t.bpm),
    }));

    if (project.timeSignatures.length === 0) {
        project.timeSignatures.push({
            id: createId("timesig"),
            tick: 0,
            numerator: 4,
            denominator: 4,
        });
    }

    if (project.tempos.length === 0) {
        project.tempos.push({
            id: createId("tempo"),
            tick: 0,
            bpm: 120,
        });
    }

    midi.tracks.forEach((track, trackIndex) => {
        const selectedInstrument = String(
            options.selectedInstruments?.[trackIndex] ??
                track.instrument.number + 1
        );

        const notes: NoteEvent[] = track.notes
            .map((note) => {
                const tick = Math.round(note.ticks * ratio);
                let duration = Math.round(note.durationTicks * ratio);

                if (duration <= 0) duration = 1;

                return {
                    id: createId("note"),
                    pitch: note.midi,
                    tick,
                    duration,
                    velocity: Math.round(note.velocity * 15),
                };
            })
            .sort((a, b) => {
                if (a.tick !== b.tick) return a.tick - b.tick;
                return a.pitch - b.pitch;
            });

        const section: WmlSection = {
            id: createId("section"),
            name: track.name || `track ${trackIndex + 1}`,
            instrument: selectedInstrument,
            sustain: [
                {
                    id: createId("sustain"),
                    tick: 0,
                    value: selectedInstrument === "1" ? 1 : 0,
                },
            ],
            chords: [
                {
                    id: createId("chord"),
                    notes,
                },
            ],
        };

        project.sections.push(section);
    });

    return project;
}