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

function createDefaultControl(): ArrangementItemControl {
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
    return state.sections[sectionId] ?? createDefaultControl();
}

export function getChordControl(chordId: string) {
    return state.chords[chordId] ?? createDefaultControl();
}

function updateSectionControl(
    sectionId: string,
    updater: (control: ArrangementItemControl) => ArrangementItemControl
) {
    state = {
        ...state,
        sections: {
            ...state.sections,
            [sectionId]: updater(getSectionControl(sectionId)),
        },
    };

    emit();
}

function updateChordControl(
    chordId: string,
    updater: (control: ArrangementItemControl) => ArrangementItemControl
) {
    state = {
        ...state,
        chords: {
            ...state.chords,
            [chordId]: updater(getChordControl(chordId)),
        },
    };

    emit();
}

export function toggleSectionVisible(sectionId: string) {
    updateSectionControl(sectionId, (control) => ({
        ...control,
        visible: !control.visible,
    }));
}

export function toggleSectionSolo(sectionId: string) {
    updateSectionControl(sectionId, (control) => ({
        ...control,
        solo: !control.solo,
    }));
}

export function toggleSectionMute(sectionId: string) {
    updateSectionControl(sectionId, (control) => ({
        ...control,
        mute: !control.mute,
    }));
}

export function toggleChordVisible(chordId: string) {
    updateChordControl(chordId, (control) => ({
        ...control,
        visible: !control.visible,
    }));
}

export function toggleChordSolo(chordId: string) {
    updateChordControl(chordId, (control) => ({
        ...control,
        solo: !control.solo,
    }));
}

export function toggleChordMute(chordId: string) {
    updateChordControl(chordId, (control) => ({
        ...control,
        mute: !control.mute,
    }));
}
