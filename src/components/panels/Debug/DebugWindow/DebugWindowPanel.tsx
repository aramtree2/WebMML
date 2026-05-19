import { useState, useEffect } from "react";
import { playbackEngine } from "../../../../core/playback/PlaybackEngine";

type MemoryInfo = {
    used: string;
    total: string;
    limit: string;
} | null;

export function DebugWindowPanel() {
    const [fps, setFps] = useState(0);
    const [frameTime, setFrameTime] = useState("0.0");
    const [memory, setMemory] = useState<MemoryInfo>(null);
    const [schedulerTime, setSchedulerTime] = useState("0.00"); // 스케줄러 연산 시간 상태 추가

    useEffect(() => {
    
        const engineAny = playbackEngine as any;
        if (!engineAny.__originalScheduleLoop) {
            engineAny.__originalScheduleLoop = engineAny.scheduleLoop;
            engineAny.scheduleLoop = function () {
                const start = performance.now();
                engineAny.__originalScheduleLoop.call(this); // 스케줄링 실행
                engineAny.__lastScheduleTimeMs = performance.now() - start; // 걸린 시간 기록
            };
        }

        let animationFrameId: number;
        let lastTime = performance.now();
        let frames = 0;
        let lastFrameTime = performance.now();

        const loop = () => {
            const now = performance.now();
            frames++;

            const delta = now - lastFrameTime;
            lastFrameTime = now;

            // 0.5초마다 UI 업데이트
            if (now - lastTime >= 500) {
                setFps(Math.round((frames * 1000) / (now - lastTime)));
                setFrameTime(delta.toFixed(1));
                
                // 측정한 스케줄러 연산 시간을 UI에 반영
                const schedTime = engineAny.__lastScheduleTimeMs || 0;
                setSchedulerTime(schedTime.toFixed(2));

                frames = 0;
                lastTime = now;

                const perf = performance as any;
                if (perf.memory) {
                    setMemory({
                        used: (perf.memory.usedJSHeapSize / 1048576).toFixed(1),
                        total: (perf.memory.totalJSHeapSize / 1048576).toFixed(1),
                        limit: (perf.memory.jsHeapSizeLimit / 1048576).toFixed(1),
                    });
                }
            }

            animationFrameId = requestAnimationFrame(loop);
        };

        loop();

        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    // 렌더링 프레임 타임 색상
    const getRenderColor = (ms: number) => {
        if (ms < 17) return "#40c057"; 
        if (ms < 33) return "#fd7e14"; 
        return "#fa5252"; 
    };

    // 스케줄러 부하 색상 (Interval이 25ms이므로, 10ms가 넘어가면 꽤 무거운 상태)
    const getSchedulerColor = (ms: number) => {
        if (ms < 5) return "#40c057"; // 아주 쾌적
        if (ms < 15) return "#fd7e14"; // 주의 요망
        return "#fa5252"; // 위험 (오디오 끊길 수 있음)
    };

    const currentFrameTime = parseFloat(frameTime);
    const currentSchedTime = parseFloat(schedulerTime);

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
                padding: "16px",
                boxSizing: "border-box",
                overflowY: "auto"
            }}
        >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", color: "#495057", borderBottom: "1px solid #e9ecef", paddingBottom: "8px" }}>
                System Performance
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                
                {/* 1. 화면 렌더링 성능 */}
                <div style={{ padding: "12px", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "6px" }}>
                    <div style={{ fontSize: "12px", color: "#868e96", marginBottom: "8px", fontWeight: "bold" }}>RENDER ENGINE (UI)</div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "13px" }}>FPS (초당 프레임)</span>
                        <strong style={{ fontSize: "16px", color: fps >= 50 ? "#40c057" : (fps >= 30 ? "#fd7e14" : "#fa5252") }}>
                            {fps}
                        </strong>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "13px" }}>Frame Time (화면 갱신)</span>
                        <strong style={{ fontSize: "16px", color: getRenderColor(currentFrameTime) }}>
                            {frameTime} ms
                        </strong>
                    </div>
                </div>

                {/* 2. 새로 추가된 오디오 스케줄러 부하 측정 */}
                <div style={{ padding: "12px", backgroundColor: "#fbf8f1", border: "1px solid #f5cb90", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <div style={{ fontSize: "12px", color: "#d9480f", fontWeight: "bold" }}>AUDIO SCHEDULER</div>
                        <span style={{ fontSize: "10px", color: "#e67700", backgroundColor: "#fff3bf", padding: "2px 6px", borderRadius: "4px" }}>
                            Interval: 25ms
                        </span>
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "13px", color: "#495057" }}>Execution Time (연산 시간)</span>
                        <strong style={{ fontSize: "16px", color: getSchedulerColor(currentSchedTime) }}>
                            {schedulerTime} ms
                        </strong>
                    </div>
                    <div style={{ fontSize: "11px", color: "#868e96", marginTop: "4px", lineHeight: "1.4" }}>
                        * 다음 음표들을 예약하는 데 걸린 시간입니다. 이 수치가 25ms에 가까워지면 오디오가 끊길 수 있습니다.
                    </div>
                </div>

                {/* 3. 자바스크립트 메모리 사용량 */}
                <div style={{ padding: "12px", backgroundColor: "#f8f9fa", border: "1px solid #dee2e6", borderRadius: "6px" }}>
                    <div style={{ fontSize: "12px", color: "#868e96", marginBottom: "8px", fontWeight: "bold" }}>JS MEMORY (HEAP)</div>
                    
                    {memory ? (
                        <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                <span style={{ fontSize: "13px" }}>Used (현재 사용량)</span>
                                <strong style={{ fontSize: "14px", color: "#228be6" }}>{memory.used} MB</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span style={{ fontSize: "13px", color: "#868e96" }}>Allocated (할당된 총량)</span>
                                <span style={{ fontSize: "13px", color: "#868e96" }}>{memory.total} MB</span>
                            </div>
                            
                            <div style={{ width: "100%", height: "8px", backgroundColor: "#e9ecef", borderRadius: "4px", overflow: "hidden" }}>
                                <div style={{ 
                                    width: `${Math.min(100, (parseFloat(memory.used) / parseFloat(memory.total)) * 100)}%`, 
                                    height: "100%", 
                                    backgroundColor: "#228be6",
                                    transition: "width 0.5s ease-out"
                                }} />
                            </div>
                            <div style={{ textAlign: "right", fontSize: "10px", color: "#adb5bd", marginTop: "4px" }}>
                                Browser Limit: {memory.limit} MB
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: "12px", color: "#adb5bd", fontStyle: "italic" }}>
                            * 현재 브라우저에서는 메모리 측정 API를 지원하지 않습니다. (Chrome/Edge 권장)
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}