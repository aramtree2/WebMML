import type { TempoEvent } from "../wml/wmlTypes";

export const PPQN = 480;
export const DEFAULT_BPM = 120;

export type NormalizedTempoEvent = {
    id?: string;
    tick: number;
    bpm: number;
};

export function normalizeTempos(tempos: TempoEvent[]): NormalizedTempoEvent[] {
    const validTempos = tempos
        .filter((tempo) => Number.isFinite(tempo.tick) && Number.isFinite(tempo.bpm) && tempo.bpm > 0)
        .sort((a, b) => a.tick - b.tick);

    const result: NormalizedTempoEvent[] = [];

    if (validTempos.length === 0 || validTempos[0].tick !== 0) {
        result.push({ tick: 0, bpm: DEFAULT_BPM });
    }

    for (const tempo of validTempos) {
        const last = result[result.length - 1];

        if (last && last.tick === tempo.tick) {
            result[result.length - 1] = tempo;
        } else {
            result.push(tempo);
        }
    }

    return result;
}

export function ticksToSeconds(ticks: number, bpm: number): number {
    return ticks * 60 / (bpm * PPQN);
}

export function secondsToTicks(seconds: number, bpm: number): number {
    return seconds * bpm * PPQN / 60;
}

export function tickToSeconds(tick: number, tempos: TempoEvent[]): number {
    const targetTick = Math.max(0, tick);
    const normalizedTempos = normalizeTempos(tempos);

    let seconds = 0;

    for (let i = 0; i < normalizedTempos.length; i++) {
        const currentTempo = normalizedTempos[i];
        const nextTempo = normalizedTempos[i + 1];
        const segmentStartTick = currentTempo.tick;
        const segmentEndTick = nextTempo ? Math.min(nextTempo.tick, targetTick) : targetTick;

        if (targetTick <= segmentStartTick) {
            break;
        }

        seconds += ticksToSeconds(segmentEndTick - segmentStartTick, currentTempo.bpm);

        if (!nextTempo || targetTick < nextTempo.tick) {
            break;
        }
    }

    return seconds;
}

export function secondsToTick(seconds: number, tempos: TempoEvent[]): number {
    const targetSeconds = Math.max(0, seconds);
    const normalizedTempos = normalizeTempos(tempos);

    let accumulatedSeconds = 0;

    for (let i = 0; i < normalizedTempos.length; i++) {
        const currentTempo = normalizedTempos[i];
        const nextTempo = normalizedTempos[i + 1];

        if (!nextTempo) {
            return currentTempo.tick + secondsToTicks(targetSeconds - accumulatedSeconds, currentTempo.bpm);
        }

        const segmentTicks = nextTempo.tick - currentTempo.tick;
        const segmentSeconds = ticksToSeconds(segmentTicks, currentTempo.bpm);

        if (targetSeconds <= accumulatedSeconds + segmentSeconds) {
            return currentTempo.tick + secondsToTicks(targetSeconds - accumulatedSeconds, currentTempo.bpm);
        }

        accumulatedSeconds += segmentSeconds;
    }

    return 0;
}
