import { createInstrumentPlayer, DEFAULT_INSTRUMENT_ID } from "../virtualInstrument";
import { getWmlProject, subscribeWmlProject } from "../wml/wmlStore";
import { buildPlaybackTimeline } from "./buildPlaybackTimeline";
import { getAllInstrumentDefs } from "../virtualInstrument/instrumentRegistry";
import type {
    InstrumentIdResolver,
    InstrumentPlayer,
    InstrumentPlayerFactory,
    PlaybackEvent,
    PlaybackListener,
    PlaybackSnapshot,
    PlaybackState,
    PlaybackTimeline,
} from "./playbackTypes";


export type PlaybackEngineOptions = {
    lookAheadSeconds?: number;
    schedulerIntervalMs?: number;
    instrumentIdResolver?: InstrumentIdResolver;
    createPlayer?: InstrumentPlayerFactory;
};

export class PlaybackEngine {
    private ctx: AudioContext | null = null;
    private timeline: PlaybackTimeline = { duration: 0, durationTick: 0, events: [] };
    private state: PlaybackState = "stopped";

    private playbackRate = 1;
    private masterVolume = 1;
    private currentTime = 0;
    private startedAtAudioTime = 0;
    private startOffset = 0;
    private nextEventIndex = 0;

    private readonly lookAheadSeconds: number;
    private readonly schedulerIntervalMs: number;
    private readonly instrumentIdResolver: InstrumentIdResolver;
    private readonly createPlayer: InstrumentPlayerFactory;
    private readonly unsubscribeWmlProject: () => void;

    private schedulerTimerId: number | null = null;
    private uiTimerId: number | null = null;
    private pendingTimerIds = new Set<number>();
    private listeners = new Set<PlaybackListener>();

    private players = new Map<string, InstrumentPlayer>();
    private loadingPlayers = new Map<string, Promise<InstrumentPlayer>>();
    private activeVoices = new Map<string, string>();
    private mutedSections = new Set<string>();
    private sectionVolumes = new Map<string, number>();

    constructor(options: PlaybackEngineOptions = {}) {
        this.lookAheadSeconds = options.lookAheadSeconds ?? 0.12;
        this.schedulerIntervalMs = options.schedulerIntervalMs ?? 25;
        this.instrumentIdResolver = options.instrumentIdResolver ?? defaultInstrumentIdResolver;
        this.createPlayer = options.createPlayer ?? createInstrumentPlayer;

        this.rebuildTimelineFromWmlStore(false);
        this.unsubscribeWmlProject = subscribeWmlProject(() => {
            this.rebuildTimelineFromWmlStore(true);
        });
    }

    rebuildTimelineFromWmlStore(keepPlaybackState = true): void {
        const project = getWmlProject();
        this.setTimeline(buildPlaybackTimeline(project), keepPlaybackState);
    }

    setTimeline(timeline: PlaybackTimeline, keepPlaybackState = true): void {
        const wasPlaying = keepPlaybackState && this.state === "playing";
        const previousTime = keepPlaybackState ? this.getCurrentTime() : 0;

        this.stopScheduler();
        this.stopAllVoices();

        this.timeline = timeline;
        this.currentTime = clamp(previousTime, 0, this.timeline.duration);
        this.startOffset = this.currentTime;
        this.nextEventIndex = findEventIndex(this.timeline.events, this.currentTime);

        if (wasPlaying && this.timeline.duration > 0) {
            this.state = "paused";
            void this.play();
        } else {
            if (this.timeline.duration <= 0) {
                this.state = "stopped";
                this.currentTime = 0;
                this.startOffset = 0;
                this.nextEventIndex = 0;
            }

            this.emit();
        }
    }

    async play(): Promise<void> {
        this.rebuildTimelineFromWmlStore(true);

        if (this.state === "playing") return;
        if (this.timeline.duration <= 0 || this.timeline.events.length === 0) {
            this.state = "stopped";
            this.currentTime = 0;
            this.emit();
            return;
        }

        const ctx = this.getAudioContext();
        await ctx.resume();

        if (this.currentTime >= this.timeline.duration) {
            this.currentTime = 0;
            this.startOffset = 0;
        }

        this.state = "playing";
        this.startedAtAudioTime = ctx.currentTime;
        this.startOffset = this.currentTime;
        this.nextEventIndex = findEventIndex(this.timeline.events, this.currentTime);

        this.startScheduler();
        this.startUiTimer();
        this.emit();
    }

    pause(): void {
        if (this.state !== "playing") return;

        this.currentTime = this.getCurrentTime();
        this.state = "paused";
        this.stopScheduler();
        this.stopAllVoices();
        this.emit();
    }

    stop(): void {
        this.state = "stopped";
        this.currentTime = 0;
        this.startOffset = 0;
        this.nextEventIndex = 0;
        this.stopScheduler();
        this.stopAllVoices();
        this.emit();
    }

    seek(time: number): void {
        const nextTime = clamp(time, 0, this.timeline.duration);
        const wasPlaying = this.state === "playing";
        const ctx = this.getAudioContextOrNull();

        this.currentTime = nextTime;
        this.startOffset = nextTime;
        this.startedAtAudioTime = ctx?.currentTime ?? 0;
        this.nextEventIndex = findEventIndex(this.timeline.events, nextTime);
        this.clearPendingTimers();
        this.stopAllVoices();

        if (wasPlaying) {
            this.startScheduler();
        }

        this.emit();
    }

    setPlaybackRate(rate: number): void {
        const safeRate = clamp(rate, 0.25, 4);
        const ctx = this.getAudioContextOrNull();

        if (this.state === "playing" && ctx) {
            this.currentTime = this.getCurrentTime();
            this.startOffset = this.currentTime;
            this.startedAtAudioTime = ctx.currentTime;
        }

        this.playbackRate = safeRate;
        this.emit();
    }

    setMasterVolume(volume: number): void {
        this.masterVolume = clamp(volume, 0, 1);
        this.emit();
    }

    setSectionMuted(sectionId: string, muted: boolean): void {
        if (muted) {
            this.mutedSections.add(sectionId);
        } else {
            this.mutedSections.delete(sectionId);
        }
    }

    toggleSectionMuted(sectionId: string): boolean {
        const nextMuted = !this.mutedSections.has(sectionId);
        this.setSectionMuted(sectionId, nextMuted);
        return nextMuted;
    }

    setSectionVolume(sectionId: string, volume: number): void {
        this.sectionVolumes.set(sectionId, clamp(volume, 0, 1));
    }

    getSnapshot(): PlaybackSnapshot {
        return {
            state: this.state,
            currentTime: this.getCurrentTime(),
            duration: this.timeline.duration,
            durationTick: this.timeline.durationTick,
            eventCount: this.timeline.events.length,
            playbackRate: this.playbackRate,
            masterVolume: this.masterVolume,
            canPlay: this.timeline.duration > 0 && this.timeline.events.length > 0,
        };
    }

    subscribe(listener: PlaybackListener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());

        return () => {
            this.listeners.delete(listener);
        };
    }

    dispose(): void {
        this.stop();
        this.unsubscribeWmlProject();
        this.listeners.clear();
    }

    private startScheduler(): void {
        this.stopScheduler(false);
        this.scheduleLoop();
        this.schedulerTimerId = window.setInterval(() => {
            this.scheduleLoop();
        }, this.schedulerIntervalMs);
    }

    private stopScheduler(clearTimers = true): void {
        if (this.schedulerTimerId !== null) {
            window.clearInterval(this.schedulerTimerId);
            this.schedulerTimerId = null;
        }

        if (this.uiTimerId !== null) {
            window.clearInterval(this.uiTimerId);
            this.uiTimerId = null;
        }

        if (clearTimers) {
            this.clearPendingTimers();
        }
    }

    private startUiTimer(): void {
        if (this.uiTimerId !== null) return;

        this.uiTimerId = window.setInterval(() => {
            if (this.state !== "playing") return;

            this.currentTime = this.getCurrentTime();

            if (this.currentTime >= this.timeline.duration) {
                this.stop();
                return;
            }

            this.emit();
        }, 50);
    }

    private scheduleLoop(): void {
        if (this.state !== "playing") return;

        const ctx = this.getAudioContext();
        const now = ctx.currentTime;
        const musicTime = this.startOffset + (now - this.startedAtAudioTime) * this.playbackRate;
        const scheduleUntil = musicTime + this.lookAheadSeconds * this.playbackRate;

        while (
            this.nextEventIndex < this.timeline.events.length &&
            this.timeline.events[this.nextEventIndex].time <= scheduleUntil
        ) {
            const event = this.timeline.events[this.nextEventIndex];

            if (event.time >= musicTime - 0.001) {
                const delayMs = Math.max(0, ((event.time - musicTime) / this.playbackRate) * 1000);
                this.scheduleEvent(event, delayMs);
            }

            this.nextEventIndex++;
        }

        if (musicTime >= this.timeline.duration) {
            this.stop();
        }
    }

    private scheduleEvent(event: PlaybackEvent, delayMs: number): void {
        const timerId = window.setTimeout(() => {
            this.pendingTimerIds.delete(timerId);
            void this.handleEvent(event);
        }, delayMs);

        this.pendingTimerIds.add(timerId);
    }

    private async handleEvent(event: PlaybackEvent): Promise<void> {
        if (this.state !== "playing") return;
        if (this.mutedSections.has(event.sectionId)) return;

        if (event.type === "sustain") {
            return;
        }

        const key = getVoiceKey(event.sectionId, event.noteId);

        if (event.type === "noteOn") {
            const instrumentId = this.instrumentIdResolver(event.wmlInstrument);
            const player = await this.getPlayer(instrumentId);
            const sectionVolume = this.sectionVolumes.get(event.sectionId) ?? 1;
            const velocity = clamp(event.velocity * this.masterVolume * sectionVolume, 0, 1);
            const voiceId = player.playNote(event.pitch, velocity);
            this.activeVoices.set(key, `${instrumentId}:${voiceId}`);
            return;
        }

        const packedVoice = this.activeVoices.get(key);
        if (!packedVoice) return;

        const separatorIndex = packedVoice.indexOf(":");
        const instrumentId = packedVoice.slice(0, separatorIndex);
        const voiceId = packedVoice.slice(separatorIndex + 1);
        const player = this.players.get(instrumentId);

        player?.stopNote(voiceId);
        this.activeVoices.delete(key);
    }

    private async getPlayer(instrumentId: string): Promise<InstrumentPlayer> {
        const cached = this.players.get(instrumentId);
        if (cached) return cached;

        const loading = this.loadingPlayers.get(instrumentId);
        if (loading) return loading;

        const promise = this.createPlayer(this.getAudioContext(), instrumentId)
            .then((player) => {
                this.players.set(instrumentId, player);
                this.loadingPlayers.delete(instrumentId);
                return player;
            })
            .catch((error) => {
                this.loadingPlayers.delete(instrumentId);
                throw error;
            });

        this.loadingPlayers.set(instrumentId, promise);
        return promise;
    }

    private stopAllVoices(): void {
        for (const player of this.players.values()) {
            player.stopAll();
        }

        this.activeVoices.clear();
    }

    private clearPendingTimers(): void {
        for (const timerId of this.pendingTimerIds) {
            window.clearTimeout(timerId);
        }

        this.pendingTimerIds.clear();
    }

    private getCurrentTime(): number {
        if (this.state !== "playing") {
            return clamp(this.currentTime, 0, this.timeline.duration);
        }

        const ctx = this.getAudioContextOrNull();
        if (!ctx) return this.currentTime;

        const time = this.startOffset + (ctx.currentTime - this.startedAtAudioTime) * this.playbackRate;
        return clamp(time, 0, this.timeline.duration);
    }

    private getAudioContext(): AudioContext {
        if (!this.ctx) {
            this.ctx = new AudioContext();
        }

        return this.ctx;
    }

    private getAudioContextOrNull(): AudioContext | null {
        return this.ctx;
    }

    private emit(): void {
        const snapshot = this.getSnapshot();
        for (const listener of this.listeners) {
            listener(snapshot);
        }
    }
}

export const playbackEngine = new PlaybackEngine();

function defaultInstrumentIdResolver(wmlInstrument: string): string {
    const index = Number(wmlInstrument) - 1;
    const instruments = getAllInstrumentDefs();

    return instruments[index]?.id ?? DEFAULT_INSTRUMENT_ID;
}
function findEventIndex(events: PlaybackEvent[], time: number): number {
    let low = 0;
    let high = events.length;

    while (low < high) {
        const mid = Math.floor((low + high) / 2);

        if (events[mid].time < time) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low;
}

function getVoiceKey(sectionId: string, noteId: string): string {
    return `${sectionId}:${noteId}`;
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}
