// === Sound Settings ===
let sustainTime = 0.5;

// === Octave Section ===
const octavecanvas = document.getElementById("OctavePiano");
const octx = octavecanvas.getContext("2d");

const octavenumWhiteKeys = 56;
const octavechangeKeyWidth = octavecanvas.width * 0.13;
const octavewhiteKeyWidth = (octavecanvas.width - 2 * octavechangeKeyWidth) / octavenumWhiteKeys;
const octavewhiteKeyHeight = octavecanvas.height * 0.7;
const octaveblackKeyWidth = octavewhiteKeyWidth * 0.6;
const octaveblackKeyHeight = octavewhiteKeyHeight * 0.6;

const OctaveLabelHeight = octavecanvas.height * 0.3;
const OctaveCount = 8;
const OctaveWhiteKeys = octavenumWhiteKeys / OctaveCount;
let OctaveSelectedIndex = 3;

// === Piano Section ===
const canvas = document.getElementById("piano");
const ctx = canvas.getContext("2d");

const numWhiteKeys = 14;
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

const whiteKeyWidth = canvasWidth / numWhiteKeys;
const whiteKeyHeight = canvasHeight;
const blackKeyWidth = whiteKeyWidth * 0.6;
const blackKeyHeight = whiteKeyHeight * 0.55;

const whiteKeys = ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Y', 'U', 'I', 'O', 'P', '[', ']'];
const blackKeys = ['S', 'D', '', 'G', 'H', 'J', '', '7', '8', '', '0', '-', '='];
const blackKeyOffsets = [1, 2, null, 4, 5, 6, null, 8, 9, null, 11, 12, 13];

const whiteKeyNoteOffsets = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
const blackKeyNoteOffsets = [1, 3, null, 6, 8, 10, null, 13, 15, null, 18, 20, 22];

const keyToWhiteIndex = {
    KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3, KeyB: 4, KeyN: 5, KeyM: 6,
    KeyY: 7, KeyU: 8, KeyI: 9, KeyO: 10, KeyP: 11, BracketLeft: 12, BracketRight: 13
};
const keyToBlackIndex = {
    KeyS: 0, KeyD: 1, KeyG: 3, KeyH: 4, KeyJ: 5,
    Digit7: 7, Digit8: 8, Digit0: 10, Minus: 11, Equal: 12
};

// === Input State ===
const pressedByMouse = new Set();
const pressedByKeyboard = new Set();
const activeSources = new Map();
let lastMouseKey = null;
let isMouseDown = false;

// === Draw Octave ===
function drawOctave() {
    const OctaveSelectedStart = OctaveSelectedIndex * OctaveWhiteKeys;
    const OctaveSelectedEnd = OctaveSelectedStart + (2 * OctaveWhiteKeys) - 1;

    octx.clearRect(0, 0, octavecanvas.width, octavecanvas.height);

    for (let i = 0; i < octavenumWhiteKeys; i++) {
        const x = i * octavewhiteKeyWidth + octavechangeKeyWidth;
        octx.fillStyle = (i >= OctaveSelectedStart && i <= OctaveSelectedEnd) ? "#ffffff" : "#888888";
        octx.fillRect(x, 0, octavewhiteKeyWidth, octavewhiteKeyHeight);
        octx.strokeRect(x, 0, octavewhiteKeyWidth, octavewhiteKeyHeight);
    }

    const blackKeyPattern = [1, 1, 0, 1, 1, 1, 0];
    for (let i = 0; i < octavenumWhiteKeys - 1; i++) {
        const step = i % 7;
        if (blackKeyPattern[step]) {
            const x = octavechangeKeyWidth + (i + 1) * octavewhiteKeyWidth - octaveblackKeyWidth / 2;
            octx.fillStyle = "#000";
            octx.fillRect(x, 0, octaveblackKeyWidth, octaveblackKeyHeight);
        }
    }

    for (let i = 0; i < OctaveCount; i++) {
        const x = i * OctaveWhiteKeys * octavewhiteKeyWidth + octavechangeKeyWidth;
        octx.fillStyle = (i === OctaveSelectedIndex || i - 1 === OctaveSelectedIndex) ? "#ffffff" : "#555555";
        octx.fillRect(x, octavewhiteKeyHeight, OctaveWhiteKeys * octavewhiteKeyWidth, OctaveLabelHeight);
        octx.strokeRect(x, octavewhiteKeyHeight, OctaveWhiteKeys * octavewhiteKeyWidth, OctaveLabelHeight);
        octx.fillStyle = "#000";
        octx.font = `${octavewhiteKeyWidth * 1.2}px Arial`;
        octx.textAlign = "center";
        octx.textBaseline = "middle";
        octx.fillText("F" + (i + 1), x + (OctaveWhiteKeys * octavewhiteKeyWidth) / 2, octavewhiteKeyHeight + OctaveLabelHeight / 2);
    }

    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, octavechangeKeyWidth, octavecanvas.height);
    octx.strokeRect(0, 0, octavechangeKeyWidth, octavecanvas.height);
    octx.fillRect(octavecanvas.width - octavechangeKeyWidth, 0, octavechangeKeyWidth, octavecanvas.height);
    octx.strokeRect(octavecanvas.width - octavechangeKeyWidth, 0, octavechangeKeyWidth, octavecanvas.height);
    octx.fillStyle = "#000";
    octx.fillText("LShift  ◀", octavechangeKeyWidth / 2, octavecanvas.height / 2);
    octx.fillText("▶  RShift", octavecanvas.width - octavechangeKeyWidth / 2, octavecanvas.height / 2);
}

// === Audio ===
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = new Map();

async function loadAllSamples() {
    for (let i = 0; i <= 95; i++) {
        const name = i.toString().padStart(2, '0');
        const response = await fetch(`./sounds/SGMPiano/${name}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers.set(i, audioBuffer);
    }
}

function playNote(index, key) {
    const buffer = audioBuffers.get(index);
    if (!buffer) return;
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    source.buffer = buffer;
    source.connect(gainNode).connect(audioContext.destination);
    source.start();
    activeSources.set(key, { source, gainNode });
}

function stopNote(key) {
    const node = activeSources.get(key);
    if (node) {
        try {
            node.gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + sustainTime);
            node.source.stop(audioContext.currentTime + sustainTime);
        } catch (e) {}
        activeSources.delete(key);
    }
}

// === Update Keyboard Input ===
window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (keyToWhiteIndex.hasOwnProperty(e.code)) {
        const i = keyToWhiteIndex[e.code];
        const key = `w${i}`;
        pressedByKeyboard.add(key);
        playNote(OctaveSelectedIndex * 12 + whiteKeyNoteOffsets[i], key);
        drawKeys();
    }
    if (keyToBlackIndex.hasOwnProperty(e.code)) {
        const i = keyToBlackIndex[e.code];
        const key = `b${i}`;
        pressedByKeyboard.add(key);
        playNote(OctaveSelectedIndex * 12 + blackKeyNoteOffsets[i], key);
        drawKeys();
    }
    if (e.code === "ShiftLeft") {
        e.preventDefault();
        OctaveSelectedIndex = Math.max(0, OctaveSelectedIndex - 1);
        drawOctave();
    }
    if (e.code === "ShiftRight") {
        e.preventDefault();
        OctaveSelectedIndex = Math.min(6, OctaveSelectedIndex + 1);
        drawOctave();
    }
});

window.addEventListener("keyup", (e) => {
    if (keyToWhiteIndex.hasOwnProperty(e.code)) {
        const i = keyToWhiteIndex[e.code];
        const key = `w${i}`;
        pressedByKeyboard.delete(key);
        stopNote(key);
        drawKeys();
    }
    if (keyToBlackIndex.hasOwnProperty(e.code)) {
        const i = keyToBlackIndex[e.code];
        const key = `b${i}`;
        pressedByKeyboard.delete(key);
        stopNote(key);
        drawKeys();
    }
});


// === Mouse Input ===
canvas.addEventListener("mousedown", (e) => {
    isMouseDown = true;
    handleMouseInput(e.offsetX, e.offsetY);
});

canvas.addEventListener("mousemove", (e) => {
    if (isMouseDown) handleMouseInput(e.offsetX, e.offsetY);
});

canvas.addEventListener("mouseup", () => {
    isMouseDown = false;
    if (lastMouseKey) {
        pressedByMouse.delete(lastMouseKey);
        stopNote(lastMouseKey);
    }
    lastMouseKey = null;
    drawKeys();
});

canvas.addEventListener("mouseleave", () => {
    isMouseDown = false;
    if (lastMouseKey) {
        pressedByMouse.delete(lastMouseKey);
        stopNote(lastMouseKey);
    }
    lastMouseKey = null;
    drawKeys();
});

function handleMouseInput(x, y) {
    for (let i = 0; i < blackKeys.length; i++) {
        if (!blackKeys[i] || blackKeyOffsets[i] == null) continue;
        const bx = blackKeyOffsets[i] * whiteKeyWidth - blackKeyWidth / 2;
        if (x >= bx && x <= bx + blackKeyWidth && y <= blackKeyHeight) {
            const key = `b${i}`;
            if (lastMouseKey && lastMouseKey !== key) {
                pressedByMouse.delete(lastMouseKey);
                stopNote(lastMouseKey);
            }
            if (lastMouseKey !== key) {
                pressedByMouse.add(key);
                playNote(OctaveSelectedIndex * 12 + blackKeyNoteOffsets[i], key);
            }
            lastMouseKey = key;
            drawKeys();
            return;
        }
    }
    const i = Math.floor(x / whiteKeyWidth);
    if (i >= 0 && i < whiteKeys.length) {
        const key = `w${i}`;
        if (lastMouseKey && lastMouseKey !== key) {
            pressedByMouse.delete(lastMouseKey);
            stopNote(lastMouseKey);
        }
        if (lastMouseKey !== key) {
            pressedByMouse.add(key);
            playNote(OctaveSelectedIndex * 12 + whiteKeyNoteOffsets[i], key);
        }
        lastMouseKey = key;
        drawKeys();
    }
}

window.addEventListener("blur", () => {
    pressedByKeyboard.forEach(stopNote);
    pressedByKeyboard.clear();
    drawKeys();
});

function drawKeys() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    for (let i = 0; i < whiteKeys.length; i++) {
        const key = `w${i}`;
        const x = i * whiteKeyWidth;
        const pressed = pressedByMouse.has(key) || pressedByKeyboard.has(key);
        ctx.fillStyle = pressed ? "#ffcc00" : "#fff";
        ctx.fillRect(x, 0, whiteKeyWidth, whiteKeyHeight);
        ctx.strokeRect(x, 0, whiteKeyWidth, whiteKeyHeight);
        ctx.fillStyle = "#000";
        ctx.font = "14px Arial";
        ctx.fillText(whiteKeys[i], x + 12, 170);
    }
    for (let i = 0; i < blackKeys.length; i++) {
        if (!blackKeys[i] || blackKeyOffsets[i] == null) continue;
        const key = `b${i}`;
        const x = blackKeyOffsets[i] * whiteKeyWidth - blackKeyWidth / 2;
        const pressed = pressedByMouse.has(key) || pressedByKeyboard.has(key);
        ctx.fillStyle = pressed ? "#ffcc00" : "#000";
        ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.fillText(blackKeys[i], x + 6, 20);
    }
}

// === Octave Click ===
octavecanvas.addEventListener("click", (e) => {
    const mouseX = e.offsetX;
    const leftBoundary = octavechangeKeyWidth;
    const rightBoundary = octavecanvas.width - octavechangeKeyWidth;

    if (mouseX < leftBoundary) {
        OctaveSelectedIndex = Math.max(0, OctaveSelectedIndex - 1);
    } else if (mouseX > rightBoundary) {
        OctaveSelectedIndex = Math.min(6, OctaveSelectedIndex + 1);
    } else {
        const usableWidth = octavecanvas.width - 2 * octavechangeKeyWidth;
        const relativeX = mouseX - octavechangeKeyWidth;
        const scaledX = relativeX * (octavenumWhiteKeys / usableWidth);
        const index = Math.min(6, Math.floor(scaledX / OctaveWhiteKeys));
        OctaveSelectedIndex = index;
    }
    drawOctave();
});

loadAllSamples();
drawOctave();
drawKeys();
