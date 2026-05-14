import { useEffect, useState, type CSSProperties } from "react";
import { playbackEngine, type PlaybackSnapshot } from "../../../core/playback";

export function PlaybackPanel() {
    const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(() => playbackEngine.getSnapshot());

    useEffect(() => {
        return playbackEngine.subscribe(setSnapshot);
    }, []);

    const isPlaying = snapshot.state === "playing";
    const canPlay = snapshot.canPlay;
    const progress = snapshot.duration > 0
        ? snapshot.currentTime / snapshot.duration
        : 0;
    const progressPercent = Math.round(progress * 100);
    const volumePercent = Math.round(snapshot.masterVolume * 100);

    const handlePlayPause = () => {
        if (isPlaying) {
            playbackEngine.pause();
            return;
        }

        void playbackEngine.play();
    };

    const handleStop = () => {
        playbackEngine.stop();
    };

    const handleSeek = (value: string) => {
        playbackEngine.seek(Number(value));
    };

    const handlePlaybackRate = (value: string) => {
        playbackEngine.setPlaybackRate(Number(value));
    };

    const handleMasterVolume = (value: string) => {
        playbackEngine.setMasterVolume(Number(value));
    };

    return (
        <div className="panel-content playback-panel">
            <style>{playbackPanelCss}</style>

            <div className="playback-panel__main-row">
                <div className="playback-panel__buttons">
                    <button
                        className="playback-panel__icon-button"
                        type="button"
                        disabled={!canPlay}
                        onClick={handlePlayPause}
                        aria-label={isPlaying ? "일시정지" : "재생"}
                        title={isPlaying ? "일시정지" : "재생"}
                    >
                        {isPlaying ? (
                            <span className="playback-panel__pause-icon" aria-hidden="true" />
                        ) : (
                            <span className="playback-panel__play-icon" aria-hidden="true" />
                        )}
                    </button>

                    <button
                        className="playback-panel__icon-button"
                        type="button"
                        disabled={!canPlay && snapshot.currentTime <= 0}
                        onClick={handleStop}
                        aria-label="정지"
                        title="정지"
                    >
                        <span className="playback-panel__stop-icon" aria-hidden="true" />
                    </button>
                </div>

                <div className="playback-panel__seek-area">
                    <span className="playback-panel__time">
                        {formatTime(snapshot.currentTime)}
                    </span>

                    <input
                        className="playback-panel__seek"
                        type="range"
                        min={0}
                        max={snapshot.duration || 0}
                        step={0.01}
                        value={snapshot.currentTime}
                        disabled={!canPlay}
                        onChange={(event) => handleSeek(event.target.value)}
                        aria-label="재생 위치"
                        style={{ "--progress": `${progressPercent}%` } as CSSProperties}
                    />

                    <span className="playback-panel__time playback-panel__duration">
                        {formatTime(snapshot.duration)}
                    </span>
                </div>
            </div>

            <div className="playback-panel__settings-row">
                <label className="playback-panel__field playback-panel__rate-field">
                    <span>재생 속도</span>
                    <select
                        value={snapshot.playbackRate}
                        disabled={!canPlay}
                        onChange={(event) => handlePlaybackRate(event.target.value)}
                        aria-label="재생 속도"
                    >
                        <option value={0.5}>0.5x</option>
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2}>2x</option>
                    </select>
                </label>

                <label className="playback-panel__field playback-panel__volume-field">
                    <span>마스터 볼륨</span>
                    <input
                        className="playback-panel__volume"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={snapshot.masterVolume}
                        onChange={(event) => handleMasterVolume(event.target.value)}
                        aria-label="마스터 볼륨"
                        style={{ "--volume": `${volumePercent}%` } as CSSProperties}
                    />
                    <span className="playback-panel__volume-value">{volumePercent}%</span>
                </label>
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const restSeconds = Math.floor(safeSeconds % 60);

    return `${hours}:${minutes.toString().padStart(2, "0")}:${restSeconds.toString().padStart(2, "0")}`;
}

const playbackPanelCss = `
.playback-panel {
    --accent: #a843c4;
    --track: #eceef2;
    --border: #d7dce3;
    --text: #111827;

    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(10px, 4%, 24px);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(10px, 3%, 24px);
    box-sizing: border-box;
    color: var(--text);
    overflow: hidden;
}

.playback-panel__main-row,
.playback-panel__settings-row {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    gap: clamp(6px, 1.2vw, 14px);
}

.playback-panel__main-row {
    flex-wrap: nowrap;
}

.playback-panel__settings-row {
    flex-wrap: wrap;
}

.playback-panel__buttons {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: clamp(5px, 0.9vw, 10px);
}

.playback-panel__icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: clamp(30px, 4.4vw, 42px);
    height: clamp(30px, 4.4vw, 42px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #ffffff;
    color: #111827;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.playback-panel__icon-button:disabled {
    color: #9ca3af;
    background: #f9fafb;
    cursor: not-allowed;
    opacity: 0.75;
}

.playback-panel__play-icon {
    width: 0;
    height: 0;
    border-top: clamp(6px, 0.9vw, 9px) solid transparent;
    border-bottom: clamp(6px, 0.9vw, 9px) solid transparent;
    border-left: clamp(10px, 1.4vw, 15px) solid currentColor;
    margin-left: 6%;
}

.playback-panel__pause-icon {
    width: clamp(11px, 1.4vw, 15px);
    height: clamp(14px, 1.9vw, 19px);
    background: linear-gradient(
        to right,
        currentColor 0 34%,
        transparent 34% 66%,
        currentColor 66% 100%
    );
}

.playback-panel__stop-icon {
    width: clamp(10px, 1.4vw, 14px);
    height: clamp(10px, 1.4vw, 14px);
    border-radius: 2px;
    background: currentColor;
}

.playback-panel__seek-area {
    display: flex;
    align-items: center;
    flex: 999 1 auto;
    min-width: 0;
    gap: clamp(6px, 1vw, 10px);
}

.playback-panel__time {
    flex: 0 0 auto;
    font-size: clamp(12px, 1.35vw, 16px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
}

.playback-panel__duration {
    color: #4b5563;
}

.playback-panel__seek,
.playback-panel__volume {
    appearance: none;
    min-width: 0;
    height: clamp(6px, 0.8vw, 8px);
    border-radius: 999px;
    outline: none;
    cursor: pointer;
}

.playback-panel__seek {
    flex: 1 1 auto;
    width: 100%;
    background: linear-gradient(to right, var(--accent) 0 var(--progress), var(--track) var(--progress) 100%);
}

.playback-panel__seek::-webkit-slider-thumb {
    appearance: none;
    width: 0;
    height: 0;
    border: 0;
}

.playback-panel__seek::-moz-range-thumb {
    width: 0;
    height: 0;
    border: 0;
}

.playback-panel__seek:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.playback-panel__field {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: clamp(6px, 1.1vw, 12px);
    font-size: clamp(13px, 1.45vw, 17px);
    white-space: nowrap;
}

.playback-panel__rate-field {
    flex: 0 0 auto;
}

.playback-panel__rate-field select {
    width: clamp(72px, 8vw, 96px);
    height: clamp(28px, 3.8vw, 36px);
    padding: 0 26px 0 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: #ffffff;
    color: #111827;
    font-size: clamp(12px, 1.35vw, 16px);
    cursor: pointer;
}

.playback-panel__rate-field select:disabled {
    color: #9ca3af;
    background: #f9fafb;
    cursor: not-allowed;
}

.playback-panel__volume-field {
    flex: 0 1 300px;
    margin-left: auto;
}

.playback-panel__volume {
    flex: 1 1 auto;
    width: clamp(80px, 18vw, 220px);
    max-width: 220px;
    background: linear-gradient(to right, var(--accent) 0 var(--volume), var(--track) var(--volume) 100%);
}

.playback-panel__volume::-webkit-slider-thumb {
    appearance: none;
    width: clamp(12px, 1.6vw, 16px);
    height: clamp(12px, 1.6vw, 16px);
    border: 0;
    border-radius: 50%;
    background: var(--accent);
}

.playback-panel__volume::-moz-range-thumb {
    width: clamp(12px, 1.6vw, 16px);
    height: clamp(12px, 1.6vw, 16px);
    border: 0;
    border-radius: 50%;
    background: var(--accent);
}

.playback-panel__volume-value {
    flex: 0 0 40px;
    text-align: right;
    font-size: clamp(12px, 1.35vw, 16px);
    font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
    .playback-panel {
        justify-content: flex-start;
        gap: 14px;
    }

    .playback-panel__main-row {
        gap: 8px;
    }

    .playback-panel__settings-row {
        align-items: flex-start;
        flex-direction: column;
        gap: 10px;
    }

    .playback-panel__volume-field {
        width: 100%;
        margin-left: 0;
    }

    .playback-panel__volume {
        width: 100%;
        max-width: none;
    }
}
`;
