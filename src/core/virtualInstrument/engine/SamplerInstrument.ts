import type { InstrumentDef } from "../types";
import { Voice } from "./Voice";

export class SamplerInstrument {
    private ctx: AudioContext;
    private def: InstrumentDef;
    private buffers: Map<number, AudioBuffer> = new Map();
    private voices: Map<string, Voice> = new Map();

    private maxVoices = 64;

    constructor(ctx: AudioContext, def: InstrumentDef) {
        this.ctx = ctx;
        this.def = def;
    }

    async load() {
        for (const s of this.def.samples) {
            const res = await fetch(s.url);
            const arrayBuffer = await res.arrayBuffer();
            const buffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(s.note, buffer);
        }
    }

    playNote(note: number, velocity = 1, when = this.ctx.currentTime): string {
        this.enforceVoiceLimit();

        const sample = this.findClosestSample(note);
        const buffer = this.buffers.get(sample.note);
        if (!buffer) throw new Error("Sample not loaded");

        const playbackRate = Math.pow(2, (note - sample.note) / 12);
        const safeVelocity = Math.max(0, Math.min(1, velocity));

        const voice = new Voice(
            this.ctx,
            buffer,
            playbackRate,
            safeVelocity,
            this.def.adsr,
            this.def.loop,
            () => this.voices.delete(voice.id)
        );

        this.voices.set(voice.id, voice);
        voice.start(when);

        return voice.id;
    }

    stopNote(id: string, when = this.ctx.currentTime) {
        const v = this.voices.get(id);
        if (!v) return;
        v.stop(this.def.adsr.release, when);
    }

    stopAll() {
        for (const v of this.voices.values()) {
            v.forceStop();
        }
        this.voices.clear();
    }

    private enforceVoiceLimit() {
        if (this.voices.size < this.maxVoices) return;

        const releasing = [...this.voices.values()].find((v) => v.isReleasing);
        if (releasing) {
            releasing.forceStop();
            this.voices.delete(releasing.id);
            return;
        }

        const oldest = this.voices.values().next().value;
        if (oldest) {
            oldest.forceStop();
            this.voices.delete(oldest.id);
        }
    }

    private findClosestSample(note: number) {
        let best = this.def.samples[0];

        for (const s of this.def.samples) {
            if (Math.abs(s.note - note) < Math.abs(best.note - note)) {
                best = s;
            }
        }

        return best;
    }
}
