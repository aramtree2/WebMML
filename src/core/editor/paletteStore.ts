export type NotePaletteDenominator = 1 | 2 | 4 | 8 | 16 | 32;

export type RhythmModifierPaletteItem =
    | { type: "rhythm-dot"; dots: 1 | 2 }
    | { type: "rhythm-tuplet"; actual: 3 | 5 | 7 }
    | { type: "rhythm-tie" }
    | { type: "rhythm-slur" }
    | { type: "articulation"; articulation: "staccato" | "tenuto" }
    | { type: "sustain"; value: boolean };

export type PaletteItem =
    | {
          type: "note-duration" | "rest-duration";
          denominator: NotePaletteDenominator;
      }
    | RhythmModifierPaletteItem;

export type PaletteState = {
    selectedItem: PaletteItem | null;
};

let state: PaletteState = {
    selectedItem: null,
};

const listeners = new Set<(state: PaletteState) => void>();

function emit() {
    listeners.forEach((listener) => listener(state));
}

export function getPaletteState() {
    return state;
}

export function subscribePaletteState(listener: (state: PaletteState) => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function selectPaletteItem(item: PaletteItem) {
    state = {
        ...state,
        selectedItem: item,
    };

    emit();
}

export function clearPaletteSelection() {
    if (state.selectedItem == null) return;

    state = {
        ...state,
        selectedItem: null,
    };

    emit();
}

export function togglePaletteItem(item: PaletteItem) {
    if (isSamePaletteItem(state.selectedItem, item)) {
        clearPaletteSelection();
        return;
    }

    selectPaletteItem(item);
}

export function isSamePaletteItem(a: PaletteItem | null, b: PaletteItem | null) {
    if (a == null || b == null) return a === b;

    if (a.type !== b.type) return false;

    switch (a.type) {
        case "note-duration":
        case "rest-duration":
            if (b.type !== a.type) return false;
            return a.denominator === b.denominator;
        case "rhythm-dot":
            if (b.type !== "rhythm-dot") return false;
            return a.dots === b.dots;
        case "rhythm-tuplet":
            if (b.type !== "rhythm-tuplet") return false;
            return a.actual === b.actual;
        case "rhythm-tie":
            return true;
        case "rhythm-slur":
            return true;
        case "articulation":
            if (b.type !== "articulation") return false;
            return a.articulation === b.articulation;
        case "sustain":
            if (b.type !== "sustain") return false;
            return a.value === b.value;
    }
}
