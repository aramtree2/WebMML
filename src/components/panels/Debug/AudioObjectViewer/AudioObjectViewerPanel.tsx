import { useState, useEffect, useRef } from "react";
import { playbackEngine } from "../../../../core/playback/PlaybackEngine";
import { getWmlProject } from "../../../../core/wml/wmlStore";

// MIDI 번호를 음표 이름으로 변환하는 도구
const MIDI_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNoteName(midi?: number): string {
    if (midi === undefined || midi === null || isNaN(midi)) return "Unknown";
    const name = MIDI_NOTES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
}

type VoiceInfo = {
    instrumentId: string;
    voiceId: string;
    phase: string;
    elapsed: number;
    duration: number;
    currentGain: number;
    velocity: number;
    isLooping: boolean;
    sectionName: string;
    pitchNumber?: number; 
};

type ViewMode = "all" | "section" | "note";

export function AudioObjectViewerPanel() {
    // 컴포넌트 내부에 안전하게 위치
    const metadataCache = useRef<Map<string, { sectionName: string }>>(new Map());
    const pitchCache = useRef<Map<string, number>>(new Map()); 

    const [voices, setVoices] = useState<VoiceInfo[]>([]);
    const [fps, setFps] = useState(0);
    const [playbackState, setPlaybackState] = useState<string>("stopped");
    const [viewMode, setViewMode] = useState<ViewMode>("all");

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
                const playersMap = engineAny.players as Map<string, any>;
                const activeVoicesMap = engineAny.activeVoices as Map<string, string>;
                const sustainedVoicesMap = engineAny.sustainedVoices as Map<string, string>;

                // 1. WML Store에서 실시간으로 섹션 ID와 실제 매핑 이름 매치
                const sectionNameMap = new Map<string, string>();
                try {
                    const project = getWmlProject();
                    if (project && Array.isArray(project.sections)) {
                        project.sections.forEach((s: any, idx: number) => {
                            if (s && s.id) {
                                // 스토어에 적힌 이름이 있으면 사용하고, 없으면 순서대로 Untitled, Track 2~9 생성
                                sectionNameMap.set(s.id, s.name || (idx === 0 ? "Untitled" : `Track ${idx + 1}`));
                            }
                        });
                    }
                } catch (e) {
                    console.warn("WML Project Store 매핑 실패:", e);
                }

                // 음정 정보 수집
                if (playersMap) {
                    playersMap.forEach((player) => {
                        if (!player.__isPatchedForPitch) {
                            const originalPlayNote = player.playNote;
                            player.playNote = function (note: number, velocity: number = 1, when?: number) {
                                const voiceId = originalPlayNote.call(this, note, velocity, when);
                                pitchCache.current.set(voiceId, note);
                                return voiceId;
                            };
                            player.__isPatchedForPitch = true;
                        }
                    });
                }

                // 이름표 매핑 및 캐싱
                const updateCache = (map?: Map<string, string>) => {
                    if (!map) return;
                    map.forEach((packedVoice, key) => {
                        const splitIdx = key.indexOf(":");
                        const sectionId = splitIdx !== -1 ? key.substring(0, splitIdx) : "Unknown";
                        
                        // 매핑된 트랙 이름을 찾고, 없으면 세이프 백업 이름 지정
                        let finalName = sectionNameMap.get(sectionId);
                        if (!finalName) {
                            const shortId = sectionId.includes("-") ? sectionId.split("-")[0] : sectionId;
                            finalName = shortId === "Unknown" ? "Unknown" : `Track (${shortId})`;
                        }

                        metadataCache.current.set(packedVoice, { sectionName: finalName });
                    });
                };
                updateCache(activeVoicesMap);
                updateCache(sustainedVoicesMap);

                const currentVoices: VoiceInfo[] = [];

                if (playersMap) {
                    playersMap.forEach((player, instrumentId) => {
                        const voicesMap = player.voices as Map<string, any>;
                        if (voicesMap) {
                            voicesMap.forEach((voice, voiceId) => {
                                const packedVoiceId = `${instrumentId}:${voiceId}`;
                                const startedAt = voice.startedAt ?? 0;
                                const ctx = engineAny.ctx as AudioContext | null;
                                const currentTime = ctx ? ctx.currentTime : 0;
                                const elapsed = currentTime - startedAt;

                                let phase = "Attack";
                                if (voice.isReleasing || voice.disposed) phase = "Release";
                                else if (elapsed > (voice.adsr.attack + voice.adsr.decay)) phase = "Sustain";
                                else if (elapsed > voice.adsr.attack) phase = "Decay";

                                const playbackRate = voice.source?.playbackRate?.value || 1;
                                const actualDuration = (voice.source?.buffer?.duration || 0) / playbackRate;
                                
                                let meta = metadataCache.current.get(packedVoiceId);

                                currentVoices.push({
                                    instrumentId,
                                    voiceId: voiceId.substring(0, 8),
                                    phase,
                                    elapsed: Math.max(0, elapsed),
                                    duration: actualDuration,
                                    currentGain: typeof voice.getScheduledGainAt === 'function' ? voice.getScheduledGainAt(currentTime) : 0,
                                    velocity: voice.velocity,
                                    isLooping: voice.source?.loop || false,
                                    sectionName: meta?.sectionName || "Release Phase",
                                    pitchNumber: pitchCache.current.get(voiceId)
                                });
                            });
                        }
                    });
                }

                // 가비지 컬렉션
                const currentVoiceIds = new Set(currentVoices.map(v => v.voiceId));
                pitchCache.current.forEach((_, key) => {
                    if (!currentVoiceIds.has(key.substring(0, 8))) pitchCache.current.delete(key);
                });
                
                const currentPackedIds = new Set(currentVoices.map(v => `${v.instrumentId}:${v.voiceId}`));
                metadataCache.current.forEach((_, key) => {
                    if (!currentPackedIds.has(key)) metadataCache.current.delete(key);
                });

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

    const renderVoiceCard = (v: VoiceInfo, i: number) => {
        const isFinished = v.duration > 0 && v.elapsed >= v.duration;
        return (
            <div key={i} style={{ border: "1px solid #dee2e6", borderRadius: "6px", padding: "8px", backgroundColor: playbackState !== "playing" ? "#f1f3f5" : "#ffffff", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", opacity: (isFinished && !v.isLooping) ? 0.7 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                        <strong style={{ color: "#495057", whiteSpace: "nowrap" }}>{v.instrumentId}</strong>
                        <span style={{ fontSize: "10px", backgroundColor: "#e7f5ff", color: "#1971c2", padding: "1px 5px", borderRadius: "3px", fontWeight: "bold" }}>{v.sectionName}</span>
                        <span style={{ fontSize: "10px", backgroundColor: "#fff3bf", color: "#d9480f", padding: "1px 5px", borderRadius: "3px", fontWeight: "bold" }}>{midiToNoteName(v.pitchNumber)}</span>
                    </div>
                    <span style={{ backgroundColor: getPhaseColor(v.phase), color: "white", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", flexShrink: 0 }}>{v.phase}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", color: "#868e96" }}>
                    <span>ID: <span style={{ color: "#495057" }}>{v.voiceId}</span></span>
                    <span>Vel: {Math.round(v.velocity * 100)}%</span>
                </div>
                <div style={{ marginTop: "4px", position: "relative", height: "14px", backgroundColor: "#e9ecef", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, (v.elapsed / Math.max(0.001, v.duration)) * 100)}%`, backgroundColor: (v.isLooping && isFinished) ? "#a5d8ff" : (isFinished ? "#e9ecef" : "#ced4da"), transition: playbackState === "playing" ? "width 0.05s linear" : "none" }} />
                    <div style={{ position: "absolute", width: "100%", textAlign: "center", lineHeight: "14px", fontSize: "10px", color: (isFinished && !v.isLooping) ? "#adb5bd" : "#495057" }}>
                        {isFinished ? (v.isLooping ? "Looping" : "Finished") : `${v.elapsed.toFixed(1)}s / ${v.duration.toFixed(1)}s`}
                    </div>
                </div>
                <div style={{ marginTop: "2px", position: "relative", height: "14px", backgroundColor: "#e9ecef", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, v.currentGain * 100)}%`, backgroundColor: getPhaseColor(v.phase), opacity: 0.6, transition: playbackState === "playing" ? "width 0.05s linear" : "none" }} />
                    <div style={{ position: "absolute", width: "100%", textAlign: "center", lineHeight: "14px", fontSize: "10px", color: "#495057" }}>
                        Gain: {(v.currentGain * 100).toFixed(1)}%
                    </div>
                </div>
            </div>
        );
    };

    const renderGroupedView = (groupBy: "sectionName" | "pitchNumber") => {
        const groups = voices.reduce((acc, voice) => {
            const key = voice[groupBy] ?? "Unknown";
            if (!acc[key]) acc[key] = [];
            acc[key].push(voice);
            return acc;
        }, {} as Record<string | number, VoiceInfo[]>);

        return Object.entries(groups).sort(([a], [b]) => {
            if (groupBy === "pitchNumber") {
                if (a === "Unknown") return 1;
                if (b === "Unknown") return -1;
                return (a as any) - (b as any); 
            }
            return a.localeCompare(b); 
        }).map(([key, groupVoices]) => (
            <div key={key} style={{ marginBottom: "10px", border: "1px solid #dee2e6", borderRadius: "6px", backgroundColor: "#f8f9fa", overflow: "hidden" }}>
                <div style={{ padding: "5px 10px", backgroundColor: "#e9ecef", fontSize: "11px", fontWeight: "bold", color: "#495057" }}>
                    {groupBy === "sectionName" ? "📁 Section: " : "🎵 Note: "}{groupBy === "pitchNumber" && key !== "Unknown" ? midiToNoteName(parseInt(key)) : key} ({groupVoices.length})
                </div>
                <div style={{ padding: "6px", display: "flex", flexDirection: "column", gap: "5px" }}>
                    {groupVoices.map((v, i) => renderVoiceCard(v, i))}
                </div>
            </div>
        ));
    };

    return (
        <div className="panel-content" style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#ffffff", color: "#333333", fontFamily: "'Consolas', 'Courier New', monospace" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "8px 12px", borderBottom: "1px solid #e9ecef", backgroundColor: "#f8f9fa", fontSize: "12px", fontWeight: "bold", flex: "0 0 auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ whiteSpace: "nowrap" }}>
                        🔊 Active Voices: <span style={{ color: "#228be6", marginLeft: "2px" }}>{voices.length}</span>
                    </span>
                </div>
                <span style={{ color: "#868e96", whiteSpace: "nowrap" }}>
                    {fps} FPS
                </span>
            </div>
            <div style={{ display: "flex", backgroundColor: "#f1f3f5", borderBottom: "1px solid #dee2e6", padding: "4px", gap: "4px", flex: "0 0 auto" }}>
                {(["all", "section", "note"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)} style={{ flex: 1, padding: "4px", fontSize: "11px", fontWeight: viewMode === mode ? "bold" : "normal", backgroundColor: viewMode === mode ? "#ffffff" : "transparent", border: viewMode === mode ? "1px solid #ced4da" : "none", borderRadius: "4px", cursor: "pointer", color: "#495057" }}>
                        {mode === "all" ? "전체 보기" : mode === "section" ? "섹션별 정렬" : "노트별 정렬"}
                    </button>
                ))}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                {voices.length === 0 ? (
                    <div style={{ textAlign: "center", color: "#adb5bd", marginTop: "40px", fontSize: "12px" }}>현재 재생 중인 사운드 객체가 없습니다.<br/>악보를 재생해 보세요!</div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {viewMode === "all" ? voices.map((v, i) => renderVoiceCard(v, i)) : renderGroupedView(viewMode === "section" ? "sectionName" : "pitchNumber")}
                    </div>
                )}
            </div>
        </div>
    );
}