export type InstrumentId = string;

export type ADSR = {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
};

export type SampleDef = {
    note: number;
    url: string;
};

export type LoopDef = {
    start: number;
    end: number;
};

export type InstrumentType = "sampler";

export type InstrumentDef = {
    id: InstrumentId;
    name: string;
    type: InstrumentType;
    samples: SampleDef[];
    adsr: ADSR;
    loop?: LoopDef | null;
};
