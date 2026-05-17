import { Midi } from "@tonejs/midi";
import type { WmlProject, WmlSection, NoteEvent, Chord } from "../wml/wmlTypes";
import { createId, tickToBar } from "../wml/wmlUtils";

import { DEFAULT_INSTRUMENT_ID } from "../virtualInstrument/instrumentRegistry";
import {
    MIDI_PROGRAM_TO_INSTRUMENT_ID,
    INSTRUMENT_ID_TO_MIDI_PROGRAM,
} from "./instrumentMappings";

const TARGET_PPQ = 480;

type MidiToWmlOptions = {
    title?: string;
    selectedInstruments?: Record<number, string | number>;
};

type Voice = {
    notes: NoteEvent[];
    lastEndTick: number;
};

function normalizeInstrumentId(value: string | number | undefined): string {
    if (value === undefined || value === null) {
        return DEFAULT_INSTRUMENT_ID;
    }

    const stringValue = String(value);

    if (INSTRUMENT_ID_TO_MIDI_PROGRAM[stringValue] !== undefined) {
        return stringValue;
    }

    const midiProgramNumber = Number(stringValue);

    if (Number.isFinite(midiProgramNumber)) {
        return (
            MIDI_PROGRAM_TO_INSTRUMENT_ID[Math.round(midiProgramNumber)] ??
            DEFAULT_INSTRUMENT_ID
        );
    }

    return DEFAULT_INSTRUMENT_ID;
}

function getInstrumentIdFromMidiProgram(programNumber: number): string {
    return (
        MIDI_PROGRAM_TO_INSTRUMENT_ID[programNumber] ??
        DEFAULT_INSTRUMENT_ID
    );
}

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

    project.timeSignatures = midi.header.timeSignatures
        .map((ts) => ({
            id: createId("timesig"),
            tick: Math.round(ts.ticks * ratio),
            numerator: ts.timeSignature?.[0] ?? 4,
            denominator: ts.timeSignature?.[1] ?? 4,
        }))
        .map((ts, _index, events) => ({
            id: ts.id,
            bar: tickToBar(ts.tick, events),
            numerator: ts.numerator,
            denominator: ts.denominator,
        }));

    project.tempos = midi.header.tempos.map((t) => ({
        id: createId("tempo"),
        tick: Math.round(t.ticks * ratio),
        bpm: Math.round(t.bpm),
    }));

    if (project.timeSignatures.length === 0) {
        project.timeSignatures.push({
            id: createId("timesig"),
            bar: 0,
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
        const midiProgramNumber = track.instrument.number + 1;

        const selectedInstrument = normalizeInstrumentId(
            options.selectedInstruments?.[trackIndex] ??
                getInstrumentIdFromMidiProgram(midiProgramNumber)
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

        if (notes.length === 0) return;

        const chords = splitMidiNotesToChords(notes);

        const section: WmlSection = {
            id: createId("section"),
            name: track.name || `Track${trackIndex + 1}`,
            instrument: selectedInstrument,
            sustain: [
                {
                    id: createId("sustain"),
                    tick: 0,
                    value: selectedInstrument === DEFAULT_INSTRUMENT_ID ? 1 : 0,
                },
            ],
            chords,
        };

        project.sections.push(section);
    });

    return project;
}

function splitMidiNotesToChords(notes: NoteEvent[]): Chord[] {
    const voices: Voice[] = [];

    for (const note of notes) {
        const startTick = note.tick;
        const endTick = note.tick + note.duration;

        let targetVoice = voices.find((voice) => voice.lastEndTick <= startTick);

        if (!targetVoice) {
            targetVoice = {
                notes: [],
                lastEndTick: 0,
            };

            voices.push(targetVoice);
        }

        targetVoice.notes.push(note);
        targetVoice.lastEndTick = Math.max(targetVoice.lastEndTick, endTick);
    }

    return voices.map((voice) => ({
        id: createId("chord"),
        notes: voice.notes.sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.pitch - b.pitch;
        }),
    }));
}
