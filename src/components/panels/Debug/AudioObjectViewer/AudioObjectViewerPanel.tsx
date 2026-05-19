import { useState, useEffect } from "react";
import { playbackEngine } from "../../../../core/playback/PlaybackEngine";

type VoiceInfo = {
    instrumentId: string;
    voiceId: string;
    phase: string;
    elapsed: number;
    duration: number;
    currentGain: number;
    velocity: number;
    isLooping: boolean;
};

export function AudioObjectViewerPanel() {
    const [voices, setVoices] = useState<VoiceInfo[]>([]);
    const [fps, setFps] = useState(0);
    const [playbackState, setPlaybackState] = useState<string>("stopped");

    useEffect(() => {
        let animationFrameId: number;
        let lastTime = performance.now();
        let frames = 0;

        const loop = () => {
            const now = performance.now();
            frames++;
            if (now - lastTime >= 1000) {
                setFps(frames);
                frames = 0;
                lastTime = now;
            }

            const engineAny = playbackEngine as any;
            const currentState = engineAny.state || "stopped";
            
            setPlaybackState(currentState);

            if (currentState === "playing") {
                const ctx = engineAny.ctx as AudioContext | null;
                const currentTime = ctx ? ctx.currentTime : 0;
                const playersMap = engineAny.players as Map<string, any>;

                const currentVoices: VoiceInfo[] = [];

                if (playersMap && ctx) {
                    playersMap.forEach((player, instrumentId) => {
                        const voicesMap = player.voices as Map<string, any>;
                        if (voicesMap) {
                            voicesMap.forEach((voice, voiceId) => {
                                const startedAt = voice.startedAt ?? 0;
                                const elapsed = currentTime - startedAt;
                                const adsr = voice.adsr;
                                
                                let phase = "Attack";
                                if (voice.isReleasing || voice.disposed) phase = "Release";
                                else if (elapsed > adsr.attack + adsr.decay) phase = "Sustain";
                                else if (elapsed > adsr.attack) phase = "Decay";
                                else if (elapsed <= 0) phase = "Waiting";

                                const currentGain = typeof voice.getScheduledGainAt === 'function' 
                                    ? voice.getScheduledGainAt(currentTime) 
                                    : 0;

                                const playbackRate = voice.source?.playbackRate?.value || 1;
                                const baseDuration = voice.source?.buffer?.duration || 0;
                                const actualDuration = baseDuration / playbackRate; 
                                
                                const isLooping = voice.source?.loop || false;

                                currentVoices.push({
                                    instrumentId,
                                    voiceId: voiceId.split("-")[0] || voiceId.substring(0, 8),
                                    phase,
                                    elapsed: Math.max(0, elapsed),
                                    duration: actualDuration,
                                    currentGain,
                                    velocity: voice.velocity,
                                    isLooping,
                                });
                            });
                        }
                    });
                }

                setVoices(currentVoices);
            }

            animationFrameId = requestAnimationFrame(loop);
        };

        loop();

        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    const getPhaseColor = (phase: string) => {
        switch (phase) {
            case "Attack": return "#fa5252"; 
            case "Decay": return "#fd7e14"; 
            case "Sustain": return "#40c057"; 
            case "Release": return "#228be6"; 
            default: return "#868e96"; 
        }
    };

    return (
        <div
            className="panel-content"
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                backgroundColor: "#ffffff",
                color: "#333333",
                fontFamily: "'Consolas', 'Courier New', monospace",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px", 
                    padding: "8px 12px",
                    borderBottom: "1px solid #e9ecef",
                    backgroundColor: "#f8f9fa",
                    fontSize: "12px",
                    fontWeight: "bold",
                    flex: "0 0 auto",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ whiteSpace: "nowrap" }}>
                        🔊 Active Voices: <span style={{ color: "#228be6", marginLeft: "2px" }}>{voices.length}</span>
                    </span>
                </div>
                <span style={{ color: "#868e96", whiteSpace: "nowrap" }}>
                    {fps} FPS
                </span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                {voices.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#adb5bd", marginTop: "40px", fontSize: "13px" }}>
                        현재 엔진에서 재생 중인 사운드 객체가 없습니다.
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {voices.map((v, i) => {
                            const isFinished = v.duration > 0 && v.elapsed >= v.duration;

                            return (
                                <div 
                                    key={i} 
                                    style={{ 
                                        border: "1px solid #dee2e6", 
                                        borderRadius: "6px", 
                                        padding: "8px",
                                        backgroundColor: playbackState !== "playing" ? "#f1f3f5" : "#f8f9fa",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "4px",
                                        fontSize: "12px",
                                        opacity: (isFinished && !v.isLooping) ? 0.7 : 1
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                                        <strong style={{ color: "#495057", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.instrumentId}</strong>
                                        <span style={{ 
                                            backgroundColor: getPhaseColor(v.phase), 
                                            color: "white", 
                                            padding: "2px 6px", 
                                            borderRadius: "4px",
                                            fontSize: "11px",
                                            fontWeight: "bold",
                                            flexShrink: 0
                                        }}>
                                            {v.phase}
                                        </span>
                                    </div>
                                    
                                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", color: "#868e96" }}>
                                        <span>ID: <span style={{ color: "#495057" }}>{v.voiceId}</span></span>
                                        <span>Vel: {(v.velocity * 100).toFixed(0)}%</span>
                                    </div>

                                    <div style={{ marginTop: "4px", position: "relative", height: "14px", backgroundColor: "#e9ecef", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{ 
                                            position: "absolute", 
                                            left: 0, top: 0, bottom: 0, 
                                            width: `${Math.min(100, (v.elapsed / Math.max(0.001, v.duration)) * 100)}%`, 
                                            backgroundColor: (v.isLooping && isFinished) ? "#a5d8ff" : (isFinished ? "#e9ecef" : "#ced4da"), 
                                            transition: playbackState === "playing" ? "width 0.05s linear" : "none"
                                        }} />
                                        <div style={{ position: "absolute", width: "100%", textAlign: "center", lineHeight: "14px", fontSize: "10px", color: (isFinished && !v.isLooping) ? "#adb5bd" : "#495057" }}>
                                            {isFinished 
                                                ? (v.isLooping ? `${v.elapsed.toFixed(2)}s (Looping ♾️)` : `${v.duration.toFixed(2)}s (Finished 🔇)`) 
                                                : `${v.elapsed.toFixed(2)}s / ${v.duration > 0 ? v.duration.toFixed(2) + "s" : "Loop"}`}
                                        </div>
                                    </div>

                                    <div style={{ marginTop: "2px", position: "relative", height: "14px", backgroundColor: "#e9ecef", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{ 
                                            position: "absolute", 
                                            left: 0, top: 0, bottom: 0, 
                                            width: `${Math.min(100, v.currentGain * 100)}%`, 
                                            backgroundColor: getPhaseColor(v.phase),
                                            opacity: 0.7,
                                            transition: playbackState === "playing" ? "width 0.05s linear" : "none"
                                        }} />
                                        <div style={{ position: "absolute", width: "100%", textAlign: "center", lineHeight: "14px", fontSize: "10px", color: "#495057" }}>
                                            Gain: {(v.currentGain * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}