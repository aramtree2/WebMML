import { Midi } from "@tonejs/midi";
import type { WmlProject, NoteEvent } from "../wml/wmlTypes";

import { DEFAULT_INSTRUMENT_ID } from "../virtualInstrument/instrumentRegistry";
import { INSTRUMENT_ID_TO_MIDI_PROGRAM } from "../parser/instrumentMappings";
import { barToTick } from "../wml/wmlUtils";

type WmlToMidiOptions = {
    selectedInstruments?: Record<number, string | number>;
};

const DEFAULT_MIDI_PROGRAM =
    INSTRUMENT_ID_TO_MIDI_PROGRAM[DEFAULT_INSTRUMENT_ID] ?? 1;

function normalizeInstrument(value: string | number | undefined): number {
    if (typeof value === "string") {
        const mappedProgram = INSTRUMENT_ID_TO_MIDI_PROGRAM[value];

        if (mappedProgram !== undefined) {
            return mappedProgram;
        }
    }

    const num = Number(value);

    if (!Number.isFinite(num)) {
        return DEFAULT_MIDI_PROGRAM;
    }

    return Math.max(1, Math.min(128, Math.round(num)));
}

export function wmlToMidi(
    wml: WmlProject,
    options: WmlToMidiOptions = {}
): Midi {
    const midi = new Midi();

    for (const ts of wml.timeSignatures) {
        midi.header.timeSignatures.push({
            ticks: barToTick(ts.bar, wml.timeSignatures),
            timeSignature: [ts.numerator, ts.denominator],
        });
    }

    for (const tempo of wml.tempos) {
        midi.header.tempos.push({
            ticks: tempo.tick,
            bpm: tempo.bpm,
        });
    }

    wml.sections.forEach((section, sectionIndex) => {
        const track = midi.addTrack();

        const instrument = normalizeInstrument(
            options.selectedInstruments?.[sectionIndex] ?? section.instrument
        );

        track.instrument.number = instrument - 1;

        const notes: NoteEvent[] = section.chords.flatMap(
            (chord) => chord.notes
        );

        notes.forEach((note) => {
            track.addNote({
                midi: note.pitch,
                ticks: note.tick,
                durationTicks: note.duration,
                velocity: Math.max(0, Math.min(1, note.velocity / 15)),
            });
        });
    });

    return midi;
}
