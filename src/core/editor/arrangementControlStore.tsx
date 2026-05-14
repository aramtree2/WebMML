export type ArrangementItemControl = {
    visible: boolean;
    solo: boolean;
    mute: boolean;
};

export type ArrangementControlState = {
    sections: Record<string, ArrangementItemControl>;
    chords: Record<string, ArrangementItemControl>;
};

const defaultControl: ArrangementItemControl = {
    visible: true,
    solo: false,
    mute: false,
};

let state: ArrangementControlState = {
    sections: {},
    chords: {},
};

const listeners = new Set<(state: ArrangementControlState) => void>();

function cloneDefault(): ArrangementItemControl {
    return { ...defaultControl };
}

function emit() {
    listeners.forEach((listener) => listener(state));
}

export function getArrangementControlState() {
    return state;
}

export function subscribeArrangementControlState(
    listener: (state: ArrangementControlState) => void
) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getSectionControl(sectionId: string) {
    return state.sections[sectionId] ?? cloneDefault();
}

export function getChordControl(chordId: string) {
    return state.chords[chordId] ?? cloneDefault();
}

export function toggleSectionVisible(sectionId: string) {
    const current = getSectionControl(sectionId);

    state = {
        ...state,
        sections: {
            ...state.sections,
            [sectionId]: {
                ...current,
                visible: !current.visible,
            },
        },
    };

    emit();
}

export function toggleSectionSolo(sectionId: string) {
    const current = getSectionControl(sectionId);

    state = {
        ...state,
        sections: {
            ...state.sections,
            [sectionId]: {
                ...current,
                solo: !current.solo,
            },
        },
    };

    emit();
}

export function toggleSectionMute(sectionId: string) {
    const current = getSectionControl(sectionId);

    state = {
        ...state,
        sections: {
            ...state.sections,
            [sectionId]: {
                ...current,
                mute: !current.mute,
            },
        },
    };

    emit();
}

export function toggleChordVisible(chordId: string) {
    const current = getChordControl(chordId);

    state = {
        ...state,
        chords: {
            ...state.chords,
            [chordId]: {
                ...current,
                visible: !current.visible,
            },
        },
    };

    emit();
}

export function toggleChordSolo(chordId: string) {
    const current = getChordControl(chordId);

    state = {
        ...state,
        chords: {
            ...state.chords,
            [chordId]: {
                ...current,
                solo: !current.solo,
            },
        },
    };

    emit();
}

export function toggleChordMute(chordId: string) {
    const current = getChordControl(chordId);

    state = {
        ...state,
        chords: {
            ...state.chords,
            [chordId]: {
                ...current,
                mute: !current.mute,
            },
        },
    };

    emit();
}