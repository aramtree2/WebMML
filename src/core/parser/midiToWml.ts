import { Midi } from "@tonejs/midi";
import type { WmlProject, WmlSection, Chord } from "../wml/wmlTypes";
import { createId } from "../wml/wmlUtils";

const TARGET_PPQ = 480;

type MidiToWmlOptions = {
    title?: string;

    // track index별로 사용자가 선택한 instrument
    // 예: { 0: 1, 1: 25 }
    selectedInstruments?: Record<number, number>;
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

    // 박자표 변환
    project.timeSignatures = midi.header.timeSignatures.map(ts => ({
        id: createId("timesig"),
        tick: Math.round(ts.ticks * ratio),
        numerator: ts.timeSignature?.[0] ?? 4,
        denominator: ts.timeSignature?.[1] ?? 4,
    }));

    // 템포 변환
    project.tempos = midi.header.tempos.map((t) => ({
        id: createId("tempo"),
        tick: Math.round(t.ticks * ratio),
        bpm: Math.round(t.bpm),
    }));

    // 기본값 보정
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

    const groupedSections = new Map<number, WmlSection>();
    const sectionOrder: number[] = [];

    midi.tracks.forEach((track, trackIndex) => {
        const selectedInstrument =
            options.selectedInstruments?.[trackIndex] ??
            track.instrument.number + 1;

        if (!groupedSections.has(selectedInstrument)) {
            groupedSections.set(selectedInstrument, {
                id: createId("section"),
                name: `Instrument ${selectedInstrument}`,
                instrument: selectedInstrument,
                sustain: [
                    {
                        id: createId("sustain"),
                        tick: 0,
                        value: selectedInstrument === 1 ? 1 : 0,
                    },
                ],
                chords: [],
            });

            sectionOrder.push(selectedInstrument);
        }

        const section = groupedSections.get(selectedInstrument)!;

        track.notes.forEach((note) => {
            const tick = Math.round(note.ticks * ratio);
            let duration = Math.round(note.durationTicks * ratio);

            if (duration <= 0) duration = 1;

            const noteEvent = {
                id: createId("note"),
                pitch: note.midi,
                tick,
                duration,
                velocity: Math.round(note.velocity * 15),
            };

            // 같은 tick의 음들은 하나의 chord로 묶음
            let chord = section.chords.find((c) => c[0]?.tick === tick);

            if (!chord) {
                chord = [];
                section.chords.push(chord);
            }

            chord.push(noteEvent);
        });
    });

    sectionOrder.forEach((instrument) => {
        const section = groupedSections.get(instrument);

        if (!section) return;
        if (section.chords.length === 0) return;

        section.chords.sort((a, b) => {
            const aTick = a[0]?.tick ?? 0;
            const bTick = b[0]?.tick ?? 0;
            return aTick - bTick;
        });

        section.chords.forEach((chord: Chord) => {
            chord.sort((a, b) => a.pitch - b.pitch);
        });

        project.sections.push(section);
    });

    return project;
}