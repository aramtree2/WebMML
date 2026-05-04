export class Voice {
    id: string;
    isReleasing = false;

    private source: AudioBufferSourceNode;
    private gain: GainNode;
    private ctx: AudioContext;
    private onEnded: () => void;
    private disposed = false;
    private velocity: number;

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

        this.applyAttack(adsr);
    }

    start() {
        if (this.disposed) return;
        this.source.start();
    }

    stop(release: number) {
        if (this.isReleasing || this.disposed) return;
        this.isReleasing = true;

        const now = this.ctx.currentTime;
        const param = this.gain.gain;
        const safeRelease = Math.max(release, 0.001);
        const currentValue = param.value;

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

    private applyAttack(adsr: { attack: number; decay: number; sustain: number }) {
        const now = this.ctx.currentTime;
        const attack = Math.max(adsr.attack, 0.001);
        const decay = Math.max(adsr.decay, 0.001);
        const sustain = Math.max(0, Math.min(adsr.sustain, 1));
        const maxGain = this.velocity;
        const sustainGain = sustain * maxGain;

        const param = this.gain.gain;

        param.cancelScheduledValues(now);
        param.setValueAtTime(0, now);
        param.linearRampToValueAtTime(maxGain, now + attack);
        param.linearRampToValueAtTime(sustainGain, now + attack + decay);
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
