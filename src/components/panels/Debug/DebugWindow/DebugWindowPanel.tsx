import { useState, useEffect, useRef } from "react";
import { playbackEngine } from "../../../../core/playback/PlaybackEngine";

type DataPoint = { time: number; fps: number; voices: number; latency: number; };
type PeakStat = { value: number; time: number; voices: number; };

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}분 ${s}초`;
};

export function DebugWindowPanel() {
    const [fps, setFps] = useState(0);
    const [schedulerTime, setSchedulerTime] = useState("0.00");

    const [peaks, setPeaks] = useState({
        maxLag: { value: 0, time: 0, voices: 0 } as PeakStat,
        minFps: { value: 60, time: 0, voices: 0 } as PeakStat,
        maxVoices: { value: 0, time: 0, lag: 0 }
    });

    // brokenLag 필드를 포함한 안정성 추적 상태
    const [stability, setStability] = useState({ isBroken: false, limitTime: 0, brokenLag: 0 });

    const peaksRef = useRef({
        maxLag: { value: 0, time: 0, voices: 0 },
        minFps: { value: 60, time: 0, voices: 0 },
        maxVoices: { value: 0, time: 0, lag: 0 }
    });
    
    const stabilityRef = useRef({ isBroken: false, limitTime: 0, brokenLag: 0 });
    
    // UI에 표시하기 위한 진짜 데드라인(Lookahead) 상태
    const [fatalLagMs, setFatalLagMs] = useState(100);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playTimeRef = useRef(0);

    const resetStats = () => {
        const initPeaks = {
            maxLag: { value: 0, time: 0, voices: 0 },
            minFps: { value: 60, time: 0, voices: 0 },
            maxVoices: { value: 0, time: 0, lag: 0 }
        };
        peaksRef.current = initPeaks;
        setPeaks(initPeaks);

        const initStability = { isBroken: false, limitTime: 0, brokenLag: 0 };
        stabilityRef.current = initStability;
        setStability(initStability);
        
        playTimeRef.current = 0;
    };

    useEffect(() => {
        const engineAny = playbackEngine as any;
        if (!engineAny.__originalScheduleLoop) {
            engineAny.__originalScheduleLoop = engineAny.scheduleLoop;
            engineAny.scheduleLoop = function () {
                const start = performance.now();
                engineAny.__originalScheduleLoop.call(this); 
                engineAny.__lastScheduleTimeMs = performance.now() - start; 
            };
        }

        let animationFrameId: number;
        let lastTime = performance.now();
        let frames = 0;
        let lastFrameTime = performance.now();
        
        const history: DataPoint[] = [];
        const MAX_HISTORY = 300; 

        const loop = () => {
            const now = performance.now();
            frames++;

            const delta = now - lastFrameTime;
            lastFrameTime = now;

            const schedTime = engineAny.__lastScheduleTimeMs || 0;
            let currentVoicesCount = 0;
            
            if (engineAny.state === "playing" && engineAny.activeVoices) {
                currentVoicesCount = engineAny.activeVoices.size;
            }

            if (engineAny.state === "playing") {
                playTimeRef.current += delta / 1000;
            }
            
            const playbackTime = playTimeRef.current;
            const latency = Math.max(0, delta - 16.6); 
            const currentFpsValue = Math.min(60, 1000 / (delta || 1));

            // 박자가 씹히는 데드라인 (오디오 엔진의 예약 시간)
            // 엔진에 scheduleAheadTime(보통 초 단위) 설정이 있으면 사용하고, 없으면 기본 100ms(0.1초) 적용
            const DANGER_WARNING_MS = 25; // 1차 경고 (스케줄러 간격)
            const FATAL_DEADLINE_MS = (engineAny.scheduleAheadTime || engineAny.lookahead || 0.1) * 1000; 
            
            if (engineAny.state === "playing") {
                // 초기 1초 로딩 구간 무시
                if (playbackTime > 1 && latency > peaksRef.current.maxLag.value) {
                    peaksRef.current.maxLag = { value: latency, time: playbackTime, voices: currentVoicesCount };
                }
                if (playbackTime > 1 && currentFpsValue < peaksRef.current.minFps.value) {
                    peaksRef.current.minFps = { value: currentFpsValue, time: playbackTime, voices: currentVoicesCount };
                }
                if (playbackTime > 1 && currentVoicesCount > peaksRef.current.maxVoices.value) {
                    peaksRef.current.maxVoices = { value: currentVoicesCount, time: playbackTime, lag: latency };
                }

                // 안정성 한계점 판별: 25ms가 아니라 'FATAL_DEADLINE_MS(데드라인)'을 넘었을 때만 판정!
                if (playbackTime > 1 && !stabilityRef.current.isBroken) {
                    if (latency >= FATAL_DEADLINE_MS) {
                        stabilityRef.current.isBroken = true;
                        stabilityRef.current.brokenLag = latency; 
                    } else {
                        stabilityRef.current.limitTime = playbackTime; 
                    }
                }

                history.push({ time: playbackTime, fps: currentFpsValue, voices: currentVoicesCount, latency });
                if (history.length > MAX_HISTORY) history.shift();
            }

            const canvas = canvasRef.current;
            if (canvas && history.length > 1) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    const width = canvas.width;
                    const height = canvas.height;
                    ctx.fillStyle = "#1e1e1e";
                    ctx.fillRect(0, 0, width, height);

                    const minTime = history[0].time;
                    const maxTime = history[history.length - 1].time;
                    const timeRange = Math.max(maxTime - minTime, 2);
                    
                    // 캔버스 최대 높이를 진짜 데드라인의 1.2배로 동적 스케일링
                    const maxCanvasVal = Math.max(100, FATAL_DEADLINE_MS * 1.2); 

                    const drawLine = (getValue: (dp: DataPoint) => number, color: string, maxVal: number) => {
                        ctx.beginPath();
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 1.5;
                        ctx.lineJoin = "round";
                        history.forEach((dp, i) => {
                            const x = ((dp.time - minTime) / timeRange) * width;
                            const normalizedY = Math.max(0, Math.min(1, getValue(dp) / maxVal));
                            const y = height - (normalizedY * height * 0.9);
                            if (i === 0) ctx.moveTo(x, y);
                            else ctx.lineTo(x, y);
                        });
                        ctx.stroke();
                    };

                    // 1. 노란색 점선 (경고: 25ms)
                    const warningY = height - (Math.min(1, DANGER_WARNING_MS / maxCanvasVal) * height * 0.9);
                    ctx.strokeStyle = "rgba(253, 126, 20, 0.5)"; // 주황/노랑색
                    ctx.setLineDash([2, 4]);
                    ctx.beginPath(); ctx.moveTo(0, warningY); ctx.lineTo(width, warningY); ctx.stroke();

                    // 2. 빨간색 굵은 점선 (진짜 데드라인: FATAL_DEADLINE_MS)
                    const fatalY = height - (Math.min(1, FATAL_DEADLINE_MS / maxCanvasVal) * height * 0.9);
                    ctx.strokeStyle = "rgba(250, 82, 82, 0.7)"; // 빨간색
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath(); ctx.moveTo(0, fatalY); ctx.lineTo(width, fatalY); ctx.stroke();
                    ctx.setLineDash([]);

                    drawLine(dp => dp.fps, "#40c057", 60); 
                    drawLine(dp => dp.voices, "#339af0", 128); 
                    drawLine(dp => dp.latency, "#fa5252", maxCanvasVal); // 렉 그래프 높이 동기화
                }
            }

            if (now - lastTime >= 500) {
                setFps(Math.round((frames * 1000) / (now - lastTime)));
                setSchedulerTime(schedTime.toFixed(2));
                setPeaks({ ...peaksRef.current }); 
                setStability({ ...stabilityRef.current }); 
                setFatalLagMs(FATAL_DEADLINE_MS); // UI 표기용

                frames = 0;
                lastTime = now;
            }
            animationFrameId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <div className="panel-content" style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "#ffffff", color: "#333333", fontFamily: "'Consolas', 'Courier New', monospace", padding: "16px", boxSizing: "border-box", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e9ecef", paddingBottom: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "14px", color: "#495057" }}>System Performance</h3>
                <button onClick={resetStats} style={{ padding: "4px 10px", fontSize: "11px", backgroundColor: "#f8f9fa", border: "1px solid #ced4da", borderRadius: "4px", cursor: "pointer", color: "#495057", fontWeight: "bold" }}>초기화 및 재측정</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                
                <div style={{ padding: "8px", backgroundColor: "#2b2b2b", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#adb5bd", marginBottom: "6px", fontWeight: "bold" }}>
                        <span style={{ color: "#40c057" }}>🟢 FPS</span>
                        <span style={{ color: "#339af0" }}>🔵 Voices</span>
                        <span style={{ color: "#fa5252" }}>🔴 Lag(ms) Fatal: {fatalLagMs}ms</span>
                    </div>
                    <canvas ref={canvasRef} width={400} height={100} style={{ width: "100%", height: "100px", backgroundColor: "#1e1e1e", borderRadius: "4px", display: "block" }} />
                </div>

                {/* 무결점 재생 판별기 */}
                <div style={{ padding: "12px", backgroundColor: stability.isBroken ? "#fff5f5" : "#f3fdf9", border: `1px solid ${stability.isBroken ? "#ffc9c9" : "#c3fae8"}`, borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ fontSize: "12px", color: stability.isBroken ? "#e03131" : "#087f5b", fontWeight: "bold" }}>⏱️ PLAYBACK STABILITY (진짜 오디오 한계선)</div>
                        {stability.isBroken ? (
                            <span style={{ fontSize: "10px", color: "#e03131", backgroundColor: "#ffe3e3", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>
                                소리 씹힘 감지 ({stability.brokenLag.toFixed(1)}ms)
                            </span>
                        ) : (
                            <span style={{ fontSize: "10px", color: "#087f5b", backgroundColor: "#e6fcf5", padding: "2px 6px", borderRadius: "4px", fontWeight: "bold" }}>결점 없이 재생 중</span>
                        )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                        <span style={{ color: "#495057" }}>연속 무결점 재생 구간</span>
                        <strong style={{ fontSize: "16px", color: stability.isBroken ? "#e03131" : "#087f5b" }}>
                            {formatTime(stability.limitTime)}
                        </strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "#868e96", lineHeight: "1.4" }}>
                        {stability.isBroken 
                            ? `* ${formatTime(stability.limitTime)} 기점에서 UI 렉이 오디오 예약 버퍼(${fatalLagMs}ms)를 완전히 초과하여 소리가 끊겼습니다.` 
                            : `* UI 렉이 발생하더라도 오디오 예약 버퍼(${fatalLagMs}ms)가 방어하여 소리가 정상 재생되고 있습니다.`}
                    </div>
                </div>

                <div style={{ padding: "12px", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "6px" }}>
                    <div style={{ fontSize: "12px", color: "#868e96", marginBottom: "8px", fontWeight: "bold" }}>🚨 BOTTLENECK RECORD (최악 수치 기록)</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "2px" }}>
                        <span>최대 지연 (Max Lag)</span>
                        <strong style={{ color: "#e03131" }}>{peaks.maxLag.value.toFixed(1)} ms</strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "#868e96", textAlign: "right", marginBottom: "8px" }}>
                        발생: {formatTime(peaks.maxLag.time)} | 동시 발음: {peaks.maxLag.voices}개
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "2px", paddingTop: "8px", borderTop: "1px dashed #dee2e6" }}>
                        <span>최대 동시 발음 (Max Voices)</span>
                        <strong style={{ color: "#1864ab" }}>{peaks.maxVoices.value} 개</strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "#868e96", textAlign: "right" }}>
                        발생: {formatTime(peaks.maxVoices.time)} | 당시 지연: {peaks.maxVoices.lag.toFixed(1)} ms
                    </div>
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                    <div style={{ flex: 1, padding: "12px", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "6px" }}>
                        <div style={{ fontSize: "11px", color: "#868e96", marginBottom: "4px", fontWeight: "bold" }}>FPS</div>
                        <strong style={{ fontSize: "16px", color: fps >= 50 ? "#40c057" : (fps >= 30 ? "#fd7e14" : "#fa5252") }}>{fps}</strong>
                    </div>
                    <div style={{ flex: 1, padding: "12px", backgroundColor: "#fbf8f1", border: "1px solid #f5cb90", borderRadius: "6px" }}>
                        <div style={{ fontSize: "11px", color: "#d9480f", marginBottom: "4px", fontWeight: "bold" }}>SCHEDULER</div>
                        <strong style={{ fontSize: "16px", color: parseFloat(schedulerTime) < 5 ? "#40c057" : (parseFloat(schedulerTime) < 15 ? "#fd7e14" : "#fa5252") }}>{schedulerTime} ms</strong>
                    </div>
                </div>

            </div>
        </div>
    );
}