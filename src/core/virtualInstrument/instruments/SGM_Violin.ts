import type { InstrumentDef } from "../types";

const base = import.meta.env.BASE_URL;

export const SGM_Violin: InstrumentDef = {
    id: "SGM_Violin",
    name: "SGM_Violin",
    type: "sampler",
    samples: [
        // { note: 57, url: `${base}samples/SGM_Violin/A3.wav` },
        { note: 69, url: `${base}samples/SGM_Violin/A4.wav` },
        { note: 81, url: `${base}samples/SGM_Violin/A5.wav` },
        // { note: 96, url: `${base}samples/SGM_Violin/C7.wav` },
    ],
    adsr: {
        attack: 0.05,
        decay: 0.1,
        sustain: 0.8,
        release: 0.2,
    },
    loop: {
        start: 0.65,
        end: 2.35,
    }
};
