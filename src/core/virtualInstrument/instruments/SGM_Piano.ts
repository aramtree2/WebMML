import type { InstrumentDef } from "../types";

const base = import.meta.env.BASE_URL;

export const SGM_Piano: InstrumentDef = {
    id: "SGM_Piano",
    name: "SGM_Piano",
    type: "sampler",
    samples: [
        { note: 21, url: `${base}samples/SGM_Piano/A0.wav` },
        { note: 33, url: `${base}samples/SGM_Piano/A1.wav` },
        { note: 45, url: `${base}samples/SGM_Piano/A2.wav` },
        { note: 57, url: `${base}samples/SGM_Piano/A3.wav` },
        { note: 69, url: `${base}samples/SGM_Piano/A4.wav` },
        { note: 81, url: `${base}samples/SGM_Piano/A5.wav` },
        { note: 93, url: `${base}samples/SGM_Piano/A6.wav` },
        { note: 105, url: `${base}samples/SGM_Piano/A7.wav` },
    ],
    adsr: {
        attack: 0.01,
        decay: 0.02,
        sustain: 0.6,
        release: 0.3,
    },
    loop: null,
};
