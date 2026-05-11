import { useEffect, useState } from "react";
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
            <div className="playback-panel__row playback-panel__buttons">
                <button
                    type="button"
                    disabled={!canPlay}
                    onClick={handlePlayPause}
                >
                    {isPlaying ? "일시정지" : "재생"}
                </button>

                <button
                    type="button"
                    disabled={!canPlay && snapshot.currentTime <= 0}
                    onClick={handleStop}
                >
                    정지
                </button>
            </div>

            <div className="playback-panel__time">
                <span>{formatTime(snapshot.currentTime)}</span>
                <span>{formatTime(snapshot.duration)}</span>
            </div>

            <input
                type="range"
                min={0}
                max={snapshot.duration || 0}
                step={0.01}
                value={snapshot.currentTime}
                disabled={!canPlay}
                onChange={(event) => handleSeek(event.target.value)}
                aria-label="재생 위치"
            />

            <div className="playback-panel__progress-text">
                {Math.round(progress * 100)}%
            </div>

            <label className="playback-panel__field">
                <span>재생속도</span>
                <select
                    value={snapshot.playbackRate}
                    disabled={!canPlay}
                    onChange={(event) => handlePlaybackRate(event.target.value)}
                >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                </select>
            </label>

            <label className="playback-panel__field">
                <span>마스터 볼륨</span>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={snapshot.masterVolume}
                    onChange={(event) => handleMasterVolume(event.target.value)}
                    aria-label="마스터 볼륨"
                />
            </label>
        </div>
    );
}

function formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const restSeconds = Math.floor(safeSeconds % 60);

    return `${minutes}:${restSeconds.toString().padStart(2, "0")}`;
}
