export class Voice {
    id: string;
    isReleasing = false;

    private source: AudioBufferSourceNode;
    private gain: GainNode;
    private ctx: AudioContext;
    private onEnded: () => void;
    private disposed = false;
    private velocity: number;
    private adsr: { attack: number; decay: number; sustain: number; release: number };
    private startedAt: number | null = null;

    constructor(
        ctx: AudioContext,
        buffer: AudioBuffer,
        playbackRate: number,
        velocity: number,
        adsr: { attack: number; decay: number; sustain: number; release: number },
        loop?: { start: number; end: number } | null,
        onEnded?: () => void
    ) {
        this.ctx = ctx;
        this.id = crypto.randomUUID();
        this.velocity = Math.max(0, Math.min(1, velocity));
        this.adsr = adsr;
        this.onEnded = onEnded ?? (() => {});

        this.source = ctx.createBufferSource();
        this.gain = ctx.createGain();

        this.source.buffer = buffer;
        this.source.playbackRate.value = playbackRate;

        if (loop) {
            this.source.loop = true;
            this.source.loopStart = loop.start;
            this.source.loopEnd = loop.end;
        }

        this.source.connect(this.gain);
        this.gain.connect(ctx.destination);

        this.source.onended = () => {
            this.dispose();
            this.onEnded();
        };

    }

    start(when = this.ctx.currentTime) {
        if (this.disposed) return;
        const startAt = Math.max(this.ctx.currentTime, when);
        this.startedAt = startAt;
        this.applyAttack(startAt);
        this.source.start(startAt);
    }

    stop(release: number, when = this.ctx.currentTime) {
        if (this.isReleasing || this.disposed) return;
        this.isReleasing = true;

        const now = Math.max(this.ctx.currentTime, when);
        const param = this.gain.gain;
        const safeRelease = Math.max(release, 0.001);
        const currentValue = this.getScheduledGainAt(now);

        param.cancelScheduledValues(now);
        param.setValueAtTime(currentValue, now);
        param.linearRampToValueAtTime(0, now + safeRelease);

        try {
            this.source.stop(now + safeRelease + 0.05);
        } catch {
            this.dispose();
            this.onEnded();
        }
    }

    forceStop() {
        if (this.disposed) return;

        try {
            this.source.stop();
        } catch {}

        this.dispose();
        this.onEnded();
    }

    private applyAttack(startAt: number) {
        const attack = Math.max(this.adsr.attack, 0.001);
        const decay = Math.max(this.adsr.decay, 0.001);
        const sustain = Math.max(0, Math.min(this.adsr.sustain, 1));
        const maxGain = this.velocity;
        const sustainGain = sustain * maxGain;

        const param = this.gain.gain;

        param.cancelScheduledValues(this.ctx.currentTime);
        param.setValueAtTime(0, startAt);
        param.linearRampToValueAtTime(maxGain, startAt + attack);
        param.linearRampToValueAtTime(sustainGain, startAt + attack + decay);
    }

    private getScheduledGainAt(time: number) {
        if (this.startedAt == null) {
            return 0;
        }

        const attack = Math.max(this.adsr.attack, 0.001);
        const decay = Math.max(this.adsr.decay, 0.001);
        const sustain = Math.max(0, Math.min(this.adsr.sustain, 1));
        const maxGain = this.velocity;
        const sustainGain = sustain * maxGain;
        const elapsed = time - this.startedAt;

        if (elapsed <= 0) return 0;
        if (elapsed < attack) return maxGain * (elapsed / attack);
        if (elapsed < attack + decay) {
            const decayProgress = (elapsed - attack) / decay;
            return maxGain + (sustainGain - maxGain) * decayProgress;
        }

        return sustainGain;
    }

    private dispose() {
        if (this.disposed) return;
        this.disposed = true;

        try {
            this.source.disconnect();
        } catch {}

        try {
            this.gain.disconnect();
        } catch {}
    }
}
