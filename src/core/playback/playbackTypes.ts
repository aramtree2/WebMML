export type PlaybackState = "stopped" | "playing" | "paused";

export type PlaybackNoteOnEvent = {
    id: string;
    type: "noteOn";
    sectionId: string;
    chordId: string;
    noteId: string;
    wmlInstrument: string;
    tick: number;
    time: number;
    pitch: number;
    velocity: number;
};

export type PlaybackNoteOffEvent = {
    id: string;
    type: "noteOff";
    sectionId: string;
    chordId: string;
    noteId: string;
    wmlInstrument: string;
    tick: number;
    time: number;
    pitch: number;
};

export type PlaybackSustainEvent = {
    id: string;
    type: "sustain";
    sectionId: string;
    tick: number;
    time: number;
    value: number;
};

export type PlaybackEvent =
    | PlaybackNoteOnEvent
    | PlaybackNoteOffEvent
    | PlaybackSustainEvent;

export type PlaybackTimeline = {
    durationTick: number;
    duration: number;
    events: PlaybackEvent[];
};

export type PlaybackSnapshot = {
    state: PlaybackState;
    currentTime: number;
    duration: number;
    durationTick: number;
    eventCount: number;
    playbackRate: number;
    masterVolume: number;
    canPlay: boolean;
};

export type PlaybackListener = (snapshot: PlaybackSnapshot) => void;

export type InstrumentPlayer = {
    playNote: (pitch: number, velocity?: number) => string;
    stopNote: (voiceId: string) => void;
    stopAll: () => void;
};

export type InstrumentPlayerFactory = (
    ctx: AudioContext,
    instrumentId: string
) => Promise<InstrumentPlayer>;

export type InstrumentIdResolver = (wmlInstrument: string) => string;
