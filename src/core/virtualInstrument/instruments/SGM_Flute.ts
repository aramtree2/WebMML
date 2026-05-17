import type { InstrumentDef } from "../types";

const base = import.meta.env.BASE_URL;

export const SGM_Flute: InstrumentDef = {
    id: "SGM_Flute",
    name: "SGM_Flute",
    type: "sampler",
    samples: [
        { note: 70, url: `${base}samples/SGM_Flute/As4.wav` },
        { note: 82, url: `${base}samples/SGM_Flute/As5.wav` },
        { note: 94, url: `${base}samples/SGM_Flute/As6.wav` },

        { note: 61, url: `${base}samples/SGM_Flute/Cs4.wav` },
        { note: 73, url: `${base}samples/SGM_Flute/Cs5.wav` },
        { note: 85, url: `${base}samples/SGM_Flute/Cs6.wav` },

        { note: 63, url: `${base}samples/SGM_Flute/Ds4.wav` },

        { note: 76, url: `${base}samples/SGM_Flute/E5.wav` },
        { note: 88, url: `${base}samples/SGM_Flute/E6.wav` },

        { note: 67, url: `${base}samples/SGM_Flute/G4.wav` },
        { note: 79, url: `${base}samples/SGM_Flute/G5.wav` },
        { note: 91, url: `${base}samples/SGM_Flute/G6.wav` },
    ],
    adsr: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.6,
        release: 0.5,
    },
    loop: {
        start: 0.55,
        end: 0.7,
    }
};
