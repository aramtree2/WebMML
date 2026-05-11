import type { InstrumentDef, InstrumentId } from "./types";
import { SamplerInstrument } from "./engine/SamplerInstrument";
import { piano } from "./instruments/piano";

export const DEFAULT_INSTRUMENT_ID: InstrumentId = "piano";

export const instrumentDefs: Record<InstrumentId, InstrumentDef> = {
    [piano.id]: piano,
};

export function getInstrumentDef(id: InstrumentId): InstrumentDef {
    const def = instrumentDefs[id];

    if (!def) {
        throw new Error(`Unknown instrument id: ${id}`);
    }

    return def;
}

export function getAllInstrumentDefs(): InstrumentDef[] {
    return Object.values(instrumentDefs);
}

export async function createInstrumentPlayer(
    ctx: AudioContext,
    instrumentId: InstrumentId
): Promise<SamplerInstrument> {
    const def = getInstrumentDef(instrumentId);

    if (def.type !== "sampler") {
        throw new Error(`Unsupported instrument type: ${def.type}`);
    }

    const player = new SamplerInstrument(ctx, def);
    await player.load();

    return player;
}
