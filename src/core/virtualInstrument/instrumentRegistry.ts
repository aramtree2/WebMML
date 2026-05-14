import type { InstrumentDef, InstrumentId } from "./types";
import { SamplerInstrument } from "./engine/SamplerInstrument";

import { SGM_Piano } from "./instruments/SGM_Piano";
import { SGM_Violin } from "./instruments/SGM_Violin";
import { SGM_Flute } from "./instruments/SGM_Flute";

export const DEFAULT_INSTRUMENT_ID: InstrumentId = "SGM_Piano";

export const instrumentDefs: Record<InstrumentId, InstrumentDef> = {
    [SGM_Piano.id]: SGM_Piano,
    [SGM_Violin.id]: SGM_Violin,
    [SGM_Flute.id]: SGM_Flute,
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
