export type NoteEvent = {
    id: string;
    pitch: number;
    tick: number;
    duration: number;
    velocity: number;
};

export type Chord = {
    id: string;
    notes: NoteEvent[];
};

export type SustainEvent = {
    id: string;
    tick: number;
    value: number;
};

export type TempoEvent = {
    id: string;
    tick: number;
    bpm: number;
};

export type TimeSignatureEvent = {
    id: string;
    tick: number;
    numerator: number;
    denominator: number;
};

export type WmlSection = {
    id: string;
    name: string;
    instrument: string;
    sustain: SustainEvent[];
    chords: Chord[];
};

export type WmlProject = {
    id: string;
    title: string;
    tempos: TempoEvent[];
    timeSignatures: TimeSignatureEvent[];
    sections: WmlSection[];
};
