import { useEffect, useRef, useState } from "react";
import { SamplerInstrument } from "../../../core/virtualInstrument/engine/SamplerInstrument";
import { createInstrumentPlayer, DEFAULT_INSTRUMENT_ID } from "../../../core/virtualInstrument/instrumentRegistry";

type HitArea =
    | {
          kind: "note";
          note: number;
          keyLabel: string;
          isBlack: boolean;
          x: number;
          y: number;
          w: number;
          h: number;
      }
    | {
          kind: "octave";
          page: number;
          x: number;
          y: number;
          w: number;
          h: number;
      }
    | {
          kind: "shift";
          dir: -1 | 1;
          x: number;
          y: number;
          w: number;
          h: number;
      }
    | {
          kind: "sustain";
          x: number;
          y: number;
          w: number;
          h: number;
      }
    | {
          kind: "volume";
          value: number;
          x: number;
          y: number;
          w: number;
          h: number;
      };

const MIN_WML_NOTE = 0;
const MAX_WML_NOTE = 96;

// 현재 SamplerInstrument/piano.ts는 MIDI note 기준 샘플을 쓰고 있으므로,
// WML note 0(C) -> MIDI C0(12)로 보정한다.
const WML_TO_MIDI_OFFSET = 24;

const WHITE_BINDINGS = [
    { key: "z", label: "Z", offset: 0 },
    { key: "x", label: "X", offset: 2 },
    { key: "c", label: "C", offset: 4 },
    { key: "v", label: "V", offset: 5 },
    { key: "b", label: "B", offset: 7 },
    { key: "n", label: "N", offset: 9 },
    { key: "m", label: "M", offset: 11 },
    { key: "y", label: "Y", offset: 12 },
    { key: "u", label: "U", offset: 14 },
    { key: "i", label: "I", offset: 16 },
    { key: "o", label: "O", offset: 17 },
    { key: "p", label: "P", offset: 19 },
    { key: "[", label: "[", offset: 21 },
    { key: "]", label: "]", offset: 23 },
] as const;

const BLACK_BINDINGS = [
    { key: "s", label: "S", offset: 1, whiteIndex: 0 },
    { key: "d", label: "D", offset: 3, whiteIndex: 1 },
    { key: "g", label: "G", offset: 6, whiteIndex: 3 },
    { key: "h", label: "H", offset: 8, whiteIndex: 4 },
    { key: "j", label: "J", offset: 10, whiteIndex: 5 },
    { key: "7", label: "7", offset: 13, whiteIndex: 7 },
    { key: "8", label: "8", offset: 15, whiteIndex: 8 },
    { key: "0", label: "0", offset: 18, whiteIndex: 10 },
    { key: "-", label: "-", offset: 20, whiteIndex: 11 },
    { key: "=", label: "=", offset: 22, whiteIndex: 12 },
] as const;

const keyToOffset = new Map<string, number>([
    ...WHITE_BINDINGS.map((b) => [b.key, b.offset] as const),
    ...BLACK_BINDINGS.map((b) => [b.key, b.offset] as const),
]);

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function normalizeKeyboardKey(e: KeyboardEvent) {
    if (e.key.length === 1) return e.key.toLowerCase();
    return e.key;
}

function wmlNoteToMidi(wmlNote: number) {
    return wmlNote + WML_TO_MIDI_OFFSET;
}

export function VirtualPianoPanel() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    const instrumentRef = useRef<SamplerInstrument | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    const hitAreasRef = useRef<HitArea[]>([]);
    const activeVoicesRef = useRef<Map<string, string>>(new Map());
    const sustainedVoicesRef = useRef<Set<string>>(new Set());
    const pressedNotesRef = useRef<Set<number>>(new Set());
    const mouseVoiceKeyRef = useRef<string | null>(null);
    const mouseNoteRef = useRef<number | null>(null);
    const isMouseDownRef = useRef(false);
    const volumeDraggingRef = useRef(false);

    const readyRef = useRef(false);
    const loadingRef = useRef(false);
    const sustainRef = useRef(false);
    const octavePageRef = useRef(3);
    const volumeRef = useRef(12);

    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sustain, setSustain] = useState(false);
    const [octavePage, setOctavePage] = useState(3);
    const [volume, setVolume] = useState(12);

    function syncReady(value: boolean) {
        readyRef.current = value;
        setReady(value);
    }

    function syncLoading(value: boolean) {
        loadingRef.current = value;
        setLoading(value);
    }

    function syncSustain(value: boolean) {
        if (sustainRef.current === value) return;

        sustainRef.current = value;
        setSustain(value);

        if (!value) {
            const instrument = instrumentRef.current;
            if (instrument) {
                sustainedVoicesRef.current.forEach((voiceId) => {
                    instrument.stopNote(voiceId);
                });
            }
            sustainedVoicesRef.current.clear();
        }

        requestAnimationFrame(draw);
    }

    function clearActiveNotes() {
        const instrument = instrumentRef.current;

        if (instrument) {
            activeVoicesRef.current.forEach((voiceId) => {
                instrument.stopNote(voiceId);
            });

            sustainedVoicesRef.current.forEach((voiceId) => {
                instrument.stopNote(voiceId);
            });
        }

        activeVoicesRef.current.clear();
        sustainedVoicesRef.current.clear();
        pressedNotesRef.current.clear();
        mouseVoiceKeyRef.current = null;
        mouseNoteRef.current = null;
        isMouseDownRef.current = false;
        volumeDraggingRef.current = false;
    }

    function syncOctavePage(value: number) {
        const clamped = clamp(value, 0, 6);
        if (octavePageRef.current === clamped) return;

        clearActiveNotes();

        octavePageRef.current = clamped;
        setOctavePage(clamped);
        requestAnimationFrame(draw);
    }

    function syncVolume(value: number) {
        const clamped = clamp(Math.round(value), 0, 15);
        volumeRef.current = clamped;
        setVolume(clamped);
        requestAnimationFrame(draw);
    }

    async function handleEnableAudio() {
        if (instrumentRef.current || loadingRef.current) return;

        syncLoading(true);

        try {
            const ctx = new AudioContext();
            await ctx.resume();
            const instrument = await createInstrumentPlayer(ctx, DEFAULT_INSTRUMENT_ID);

            audioContextRef.current = ctx;
            instrumentRef.current = instrument;

            syncReady(true);
            console.log(`${DEFAULT_INSTRUMENT_ID} ready`);
        } catch (error) {
            console.error(`${DEFAULT_INSTRUMENT_ID} load failed`, error);
            syncReady(false);
        } finally {
            syncLoading(false);
            requestAnimationFrame(draw);
        }
    }

    async function ensureAudioReady() {
        if (instrumentRef.current || loadingRef.current) return true;

        await handleEnableAudio();
        return Boolean(instrumentRef.current);
    }

    function playInput(inputId: string, wmlNote: number) {
        const instrument = instrumentRef.current;
        if (!instrument || !readyRef.current || loadingRef.current) return;
        if (activeVoicesRef.current.has(inputId)) return;
        if (wmlNote < MIN_WML_NOTE || wmlNote > MAX_WML_NOTE) return;

        const velocity = volumeRef.current / 15;
        if (velocity <= 0) return;

        const voiceId = instrument.playNote(wmlNoteToMidi(wmlNote), velocity);

        activeVoicesRef.current.set(inputId, voiceId);
        pressedNotesRef.current.add(wmlNote);

        requestAnimationFrame(draw);
    }

    function stopInput(inputId: string, wmlNote?: number) {
        const instrument = instrumentRef.current;
        if (!instrument) return;

        const voiceId = activeVoicesRef.current.get(inputId);
        if (!voiceId) return;

        activeVoicesRef.current.delete(inputId);

        if (typeof wmlNote === "number") {
            pressedNotesRef.current.delete(wmlNote);
        }

        if (sustainRef.current) {
            sustainedVoicesRef.current.add(voiceId);
        } else {
            instrument.stopNote(voiceId);
        }

        requestAnimationFrame(draw);
    }

    function getBaseNote() {
        return octavePageRef.current * 12;
    }

    function draw() {
        const canvas = canvasRef.current;
        const wrapper = wrapperRef.current;
        if (!canvas || !wrapper) return;

        const rect = wrapper.getBoundingClientRect();
        const cssWidth = Math.max(300, rect.width);
        const cssHeight = Math.max(160, rect.height);
        const dpr = window.devicePixelRatio || 1;

        const pixelWidth = Math.round(cssWidth * dpr);
        const pixelHeight = Math.round(cssHeight * dpr);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssWidth, cssHeight);

        const enabled = readyRef.current && !loadingRef.current;
        const hitAreas: HitArea[] = [];

        const outerPad = 0;
        const topH = cssHeight * 0.18;
        const sustainH = cssHeight * 0.14;
        const volumeW = Math.max(18, cssWidth * 0.045);

        const x0 = outerPad;
        const y0 = outerPad;
        const fullW = cssWidth - outerPad * 2;
        const pianoW = fullW - volumeW;
        const volumeX = x0 + pianoW;
        const topY = y0;
        const keyY = topY + topH;
        const bottomY = cssHeight - outerPad;
        const sustainY = bottomY - sustainH;
        const keyH = sustainY - keyY;

        ctx.fillStyle = "#f8f8f8";
        ctx.strokeStyle = "#a0a0a0";
        ctx.lineWidth = 1;
        roundRect(ctx, x0, y0, pianoW, bottomY - y0, cssWidth * 0.012);
        ctx.fill();
        ctx.stroke();

        drawTopBar(ctx, hitAreas, x0, topY, pianoW, topH, enabled);
        drawKeys(ctx, hitAreas, x0, keyY, pianoW, keyH, enabled);
        drawSustain(ctx, hitAreas, x0, sustainY, pianoW, sustainH, enabled);
        drawVolumeVertical(ctx, hitAreas, volumeX, topY, volumeW, bottomY - topY, enabled);

        if (loadingRef.current || !readyRef.current) {
            ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
            ctx.fillRect(x0, y0, fullW, bottomY - y0);

            ctx.fillStyle = "#333";
            ctx.font = `bold ${Math.max(14, cssHeight * 0.04)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                loadingRef.current ? "로딩 중..." : "클릭해서 피아노 활성화",
                x0 + fullW / 2,
                y0 + (bottomY - y0) / 2
            );
        }

        hitAreasRef.current = hitAreas;
    }

    function drawVolumeVertical(
        ctx: CanvasRenderingContext2D,
        hitAreas: HitArea[],
        x: number,
        y: number,
        w: number,
        h: number,
        enabled: boolean
    ) {
        const value = volumeRef.current;
        const padY = h * 0.08;
        const trackX = x + w / 2;
        const trackTop = y + padY;
        const trackBottom = y + h - padY;
        const trackH = trackBottom - trackTop;
        const knobH = Math.max(18, w * 1.15);
        const knobW = Math.max(12, w * 0.65);
        const t = value / 15;
        const knobCenterY = trackBottom - trackH * t;

        ctx.fillStyle = enabled ? "#efefef" : "#d0d0d0";
        ctx.fillRect(x, y, w, h);

        // 눈금
        ctx.strokeStyle = enabled ? "#8c8c8c" : "#aaa";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 15; i++) {
            const ty = trackBottom - (trackH * i) / 15;
            const major = i % 5 === 0;
            const tickW = major ? w * 0.72 : w * 0.42;

            ctx.beginPath();
            ctx.moveTo(trackX - tickW / 2, ty);
            ctx.lineTo(trackX + tickW / 2, ty);
            ctx.stroke();
        }

        // 트랙
        ctx.strokeStyle = enabled ? "#111" : "#777";
        ctx.lineWidth = Math.max(2, w * 0.08);
        ctx.beginPath();
        ctx.moveTo(trackX, trackTop);
        ctx.lineTo(trackX, trackBottom);
        ctx.stroke();

        // 현재 볼륨 표시 구간
        ctx.strokeStyle = enabled ? "#4a90e2" : "#999";
        ctx.lineWidth = Math.max(2, w * 0.1);
        ctx.beginPath();
        ctx.moveTo(trackX, knobCenterY);
        ctx.lineTo(trackX, trackBottom);
        ctx.stroke();

        // 손잡이: 네모 기반
        const knobX = trackX - knobW / 2;
        const knobY = knobCenterY - knobH / 2;

        ctx.fillStyle = enabled ? "#d9d9d9" : "#bdbdbd";
        ctx.strokeStyle = enabled ? "#777" : "#999";
        ctx.lineWidth = 1;
        roundRect(ctx, knobX, knobY, knobW, knobH, Math.min(5, knobW * 0.25));
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = enabled ? "#999" : "#aaa";
        ctx.beginPath();
        ctx.moveTo(knobX + knobW * 0.2, knobCenterY);
        ctx.lineTo(knobX + knobW * 0.8, knobCenterY);
        ctx.stroke();

        ctx.fillStyle = enabled ? "#111" : "#777";
        ctx.font = `${Math.max(9, w * 0.34)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(value), trackX, y + h - padY * 0.45);

        hitAreas.push({
            kind: "volume",
            value,
            x,
            y,
            w,
            h,
        });
    }

    function volumeValueFromCanvasY(canvasY: number, area: HitArea) {
        if (area.kind !== "volume") return volumeRef.current;

        const padY = area.h * 0.08;
        const top = area.y + padY;
        const bottom = area.y + area.h - padY;
        const t = clamp((bottom - canvasY) / (bottom - top), 0, 1);

        return Math.round(t * 15);
    }

    function drawTopBar(
        ctx: CanvasRenderingContext2D,
        hitAreas: HitArea[],
        x: number,
        y: number,
        w: number,
        h: number,
        enabled: boolean
    ) {
        const shiftW = w * 0.10; // 기존보다 축소 (약 80%)
        const innerW = w - shiftW * 2;

        const pianoH = h * 0.6;  // 위쪽 미니 피아노 60%
        const labelH = h * 0.4;  // 아래쪽 F1~F8 40%

        const miniX = x + shiftW;
        const pianoY = y;
        const labelY = y + pianoH;

        const cellW = innerW / 8;
        const page = octavePageRef.current;

        drawButton(ctx, x, y, shiftW, h, "LShift ◀", enabled, page > 0);
        hitAreas.push({ kind: "shift", dir: -1, x, y, w: shiftW, h });

        drawButton(ctx, x + w - shiftW, y, shiftW, h, "▶ RShift", enabled, page < 6);
        hitAreas.push({ kind: "shift", dir: 1, x: x + w - shiftW, y, w: shiftW, h });

        for (let i = 0; i < 8; i++) {
            const clickPage = i === 7 ? 6 : i;
            const isSelected = i === page || i === page + 1;
            const cx = miniX + i * cellW;

            // 미니 피아노 영역
            const smallWhiteW = cellW / 7;

            for (let k = 0; k < 7; k++) {
                ctx.fillStyle = isSelected ? "#ffffff" : enabled ? "#b0b0b0" : "#d5d5d5";
                ctx.strokeStyle = "#555";
                ctx.fillRect(cx + k * smallWhiteW, pianoY, smallWhiteW, pianoH);
                ctx.strokeRect(cx + k * smallWhiteW, pianoY, smallWhiteW, pianoH);
            }

            const blackPositions = [0, 1, 3, 4, 5];
            for (const bp of blackPositions) {
                ctx.fillStyle = enabled ? "#111" : "#999";
                ctx.fillRect(
                    cx + (bp + 0.68) * smallWhiteW,
                    pianoY,
                    smallWhiteW * 0.55,
                    pianoH * 0.6
                );
            }

            // F1~F8 버튼 영역
            ctx.fillStyle = isSelected ? "#ffffff" : enabled ? "#808080" : "#c8c8c8";
            ctx.strokeStyle = "#555";
            ctx.fillRect(cx, labelY, cellW, labelH);
            ctx.strokeRect(cx, labelY, cellW, labelH);

            ctx.fillStyle = isSelected ? "#111" : enabled ? "#222" : "#777";
            ctx.font = `${Math.max(9, labelH * 0.45)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`F${i + 1}`, cx + cellW / 2, labelY + labelH / 2);

            // 미니 피아노 + F 버튼 전체를 옥타브 클릭 영역으로 유지
            hitAreas.push({ kind: "octave", page: clickPage, x: cx, y, w: cellW, h });
        }
    }

    function drawKeys(
        ctx: CanvasRenderingContext2D,
        hitAreas: HitArea[],
        x: number,
        y: number,
        w: number,
        h: number,
        enabled: boolean
    ) {
        const baseNote = getBaseNote();
        const whiteW = w / WHITE_BINDINGS.length;
        const blackW = whiteW * 0.58;
        const blackH = h * 0.62;

        for (let i = 0; i < WHITE_BINDINGS.length; i++) {
            const binding = WHITE_BINDINGS[i];
            const note = baseNote + binding.offset;
            const disabled = !enabled || note < MIN_WML_NOTE || note > MAX_WML_NOTE;
            const isPressed = pressedNotesRef.current.has(note);

            const kx = x + i * whiteW;

            ctx.fillStyle = disabled ? "#d0d0d0" : isPressed ? "#ffd21f" : "#ffffff";
            ctx.strokeStyle = "#777";
            ctx.lineWidth = 1;
            ctx.fillRect(kx, y, whiteW, h);
            ctx.strokeRect(kx, y, whiteW, h);

            ctx.fillStyle = disabled ? "#777" : "#333";
            ctx.font = `${Math.max(11, h * 0.08)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(binding.label, kx + whiteW / 2, y + h * 0.88);

            hitAreas.push({
                kind: "note",
                note,
                keyLabel: binding.label,
                isBlack: false,
                x: kx,
                y,
                w: whiteW,
                h,
            });
        }

        // 검은 건반은 흰 건반 위에 그려야 하므로 나중에 추가한다.
        for (const binding of BLACK_BINDINGS) {
            const note = baseNote + binding.offset;
            const disabled = !enabled || note < MIN_WML_NOTE || note > MAX_WML_NOTE;
            const isPressed = pressedNotesRef.current.has(note);

            const kx = x + (binding.whiteIndex + 1) * whiteW - blackW / 2;

            ctx.fillStyle = disabled ? "#777" : isPressed ? "#e6b800" : "#050505";
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            ctx.fillRect(kx, y, blackW, blackH);
            ctx.strokeRect(kx, y, blackW, blackH);

            ctx.fillStyle = disabled ? "#cfcfcf" : "#ffffff";
            ctx.font = `${Math.max(10, h * 0.075)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(binding.label, kx + blackW / 2, y + blackH * 0.18);

            hitAreas.push({
                kind: "note",
                note,
                keyLabel: binding.label,
                isBlack: true,
                x: kx,
                y,
                w: blackW,
                h: blackH,
            });
        }
    }

    function drawSustain(
        ctx: CanvasRenderingContext2D,
        hitAreas: HitArea[],
        x: number,
        y: number,
        w: number,
        h: number,
        enabled: boolean
    ) {
        const on = sustainRef.current;
        const sx = x;
        const sy = y;
        const sw = w;
        const sh = h;

        ctx.fillStyle = !enabled ? "#d0d0d0" : on ? "#ffe066" : "#ffffff";
        ctx.fillRect(sx, sy, sw, sh);

        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + sw, sy);
        ctx.stroke();

        ctx.fillStyle = enabled ? "#111" : "#777";
        ctx.font = `bold ${Math.max(14, h * 0.28)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(on ? "스페이스바 - 서스테인 ON" : "스페이스바 - 서스테인", sx + sw / 2, sy + sh / 2);

        hitAreas.push({ kind: "sustain", x: sx, y: sy, w: sw, h: sh });
    }

    function drawButton(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        enabled: boolean,
        active: boolean
    ) {
        ctx.fillStyle = !enabled ? "#d0d0d0" : active ? "#ffffff" : "#eeeeee";
        ctx.strokeStyle = "#888";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = enabled ? "#111" : "#777";
        ctx.font = `bold ${Math.max(10, h * 0.24)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + w / 2, y + h / 2);
    }

    function roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
    ) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    function hitTest(canvasX: number, canvasY: number) {
        // 검은 건반이 흰 건반보다 위에 있으므로 뒤에서부터 검사한다.
        for (let i = hitAreasRef.current.length - 1; i >= 0; i--) {
            const h = hitAreasRef.current[i];
            if (
                canvasX >= h.x &&
                canvasX <= h.x + h.w &&
                canvasY >= h.y &&
                canvasY <= h.y + h.h
            ) {
                return h;
            }
        }
        return null;
    }

    useEffect(() => {
        readyRef.current = ready;
        requestAnimationFrame(draw);
    }, [ready]);

    useEffect(() => {
        loadingRef.current = loading;
        requestAnimationFrame(draw);
    }, [loading]);

    useEffect(() => {
        sustainRef.current = sustain;
        requestAnimationFrame(draw);
    }, [sustain]);

    useEffect(() => {
        octavePageRef.current = octavePage;
        requestAnimationFrame(draw);
    }, [octavePage]);

    useEffect(() => {
        volumeRef.current = volume;
        requestAnimationFrame(draw);
    }, [volume]);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(draw);
        });

        resizeObserver.observe(wrapper);
        requestAnimationFrame(draw);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat) return;

            if (e.code === "ShiftLeft") {
                e.preventDefault();
                syncOctavePage(octavePageRef.current - 1);
                return;
            }

            if (e.code === "ShiftRight") {
                e.preventDefault();
                syncOctavePage(octavePageRef.current + 1);
                return;
            }

            if (/^F[1-8]$/.test(e.key)) {
                e.preventDefault();
                const fNumber = Number(e.key.slice(1));
                syncOctavePage(fNumber === 8 ? 6 : fNumber - 1);
                return;
            }

            if (e.code === "Space") {
                e.preventDefault();
                syncSustain(true);
                return;
            }

            const key = normalizeKeyboardKey(e);
            const offset = keyToOffset.get(key);
            if (offset === undefined) return;

            e.preventDefault();

            void ensureAudioReady().then((ok) => {
                if (!ok) return;
                playInput(`key:${key}`, getBaseNote() + offset);
            });
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                e.preventDefault();
                syncSustain(false);
                return;
            }

            const key = normalizeKeyboardKey(e);
            const offset = keyToOffset.get(key);
            if (offset === undefined) return;

            e.preventDefault();
            stopInput(`key:${key}`, getBaseNote() + offset);
        };

        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keyup", handleKeyUp);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const getCanvasPoint = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        const stopMouseNote = () => {
            const inputId = mouseVoiceKeyRef.current;
            const note = mouseNoteRef.current;

            if (!inputId) return;

            stopInput(inputId, typeof note === "number" ? note : undefined);
            mouseVoiceKeyRef.current = null;
            mouseNoteRef.current = null;
            isMouseDownRef.current = false;
            volumeDraggingRef.current = false;
        };

        const startMouseNote = (note: number) => {
            if (!readyRef.current || loadingRef.current) return;

            const inputId = `mouse:${note}`;
            mouseVoiceKeyRef.current = inputId;
            mouseNoteRef.current = note;
            playInput(inputId, note);
        };

        const handleMouseDown = (e: MouseEvent) => {
            const p = getCanvasPoint(e);
            const hit = hitTest(p.x, p.y);
            if (!hit) return;

            e.preventDefault();
            isMouseDownRef.current = true;

            if (hit.kind === "volume") {
                volumeDraggingRef.current = true;
                syncVolume(volumeValueFromCanvasY(p.y, hit));
                return;
            }

            const wasReady = readyRef.current && !loadingRef.current;

            void ensureAudioReady().then((ok) => {
                if (!ok) return;

                // 첫 클릭은 오디오 활성화/로딩만 하고,
                // 로딩 완료 후 같은 클릭이 건반 입력으로 이어지지 않게 막는다.
                if (!wasReady) return;

                if (hit.kind === "shift") {
                    syncOctavePage(octavePageRef.current + hit.dir);
                    return;
                }

                if (hit.kind === "octave") {
                    syncOctavePage(hit.page);
                    return;
                }

                if (hit.kind === "sustain") {
                    syncSustain(!sustainRef.current);
                    return;
                }

                if (hit.kind === "note") {
                    startMouseNote(hit.note);
                }
            });
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!isMouseDownRef.current) return;

            const p = getCanvasPoint(e);
            const hit = hitTest(p.x, p.y);

            if (volumeDraggingRef.current) {
                const volumeArea = hitAreasRef.current.find((area) => area.kind === "volume");
                if (volumeArea) {
                    syncVolume(volumeValueFromCanvasY(p.y, volumeArea));
                }
                return;
            }

            if (!hit || hit.kind !== "note") {
                return;
            }

            if (!readyRef.current || loadingRef.current) return;

            if (mouseNoteRef.current === hit.note) return;

            stopMouseNote();
            startMouseNote(hit.note);
        };

        const handleMouseUp = () => {
            isMouseDownRef.current = false;
            volumeDraggingRef.current = false;
            stopMouseNote();
        };

        const handleMouseLeave = () => {
            if (!isMouseDownRef.current) return;
            isMouseDownRef.current = false;
            volumeDraggingRef.current = false;
            stopMouseNote();
        };

        canvas.addEventListener("mousedown", handleMouseDown);
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("mousemove", handleMouseMove);
            canvas.removeEventListener("mouseleave", handleMouseLeave);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, []);

    useEffect(() => {
        return () => {
            instrumentRef.current?.stopAll();
            void audioContextRef.current?.close();
        };
    }, []);

    return (
        <div
            className="panel-content"
            style={{
                width: "100%",
                height: "100%",
                minHeight: 120,
                padding: 0,
                boxSizing: "border-box",
            }}
        >
            <div
                ref={wrapperRef}
                style={{
                    width: "100%",
                    height: "100%",
                    minHeight: 120,
                    overflow: "hidden",
                }}
            >
                <canvas
                    ref={canvasRef}
                    style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        cursor: ready && !loading ? "pointer" : "default",
                    }}
                />
            </div>
        </div>
    );
}
