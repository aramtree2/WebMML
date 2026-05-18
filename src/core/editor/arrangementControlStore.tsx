export type ArrangementItemControl = {
    visible: boolean;
    solo: boolean;
    mute: boolean;
};

export type ArrangementControlState = {
    sections: Record<string, ArrangementItemControl>;
    chords: Record<string, ArrangementItemControl>;
    selectedSectionId: string | null;
    selectedChordId: string | null;
    selectedNoteId: string | null;
};

export type ArrangementSectionScope = {
    sectionId: string;
    chordIds: string[];
};

const defaultControl: ArrangementItemControl = {
    visible: true,
    solo: false,
    mute: false,
};

let state: ArrangementControlState = {
    sections: {},
    chords: {},
    selectedSectionId: null,
    selectedChordId: null,
    selectedNoteId: null,
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
    return () => {
        listeners.delete(listener);
    };
}

export function getSectionControl(sectionId: string, chordIds: string[] = []) {
    const sectionControl = state.sections[sectionId] ?? createDefaultControl();

    if (chordIds.length === 0) {
        return sectionControl;
    }

    return {
        ...sectionControl,
        visible: chordIds.some((chordId) => getChordControl(chordId).visible),
        mute: chordIds.every((chordId) => getChordControl(chordId).mute),
    };
}

export function getChordControl(chordId: string) {
    return state.chords[chordId] ?? createDefaultControl();
}

export function getArrangementSelection() {
    return {
        selectedSectionId: state.selectedSectionId,
        selectedChordId: state.selectedChordId,
        selectedNoteId: state.selectedNoteId,
    };
}

export function clearArrangementSelection() {
    if (
        state.selectedSectionId == null &&
        state.selectedChordId == null &&
        state.selectedNoteId == null
    ) {
        return;
    }

    state = {
        ...state,
        selectedSectionId: null,
        selectedChordId: null,
        selectedNoteId: null,
    };

    emit();
}

export function selectSection(sectionId: string) {
    state = {
        ...state,
        selectedSectionId: sectionId,
        selectedChordId: null,
        selectedNoteId: null,
    };

    emit();
}

export function selectChord(sectionId: string, chordId: string) {
    state = {
        ...state,
        selectedSectionId: sectionId,
        selectedChordId: chordId,
        selectedNoteId: null,
    };

    emit();
}

export function selectNote(sectionId: string, chordId: string, noteId: string) {
    state = {
        ...state,
        selectedSectionId: sectionId,
        selectedChordId: chordId,
        selectedNoteId: noteId,
    };

    emit();
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

export function toggleSectionVisible(sectionId: string, chordIds: string[] = []) {
    if (chordIds.length === 0) {
        updateSectionControl(sectionId, (control) => ({
            ...control,
            visible: !control.visible,
        }));
        return;
    }

    const hasVisibleChord = chordIds.some((chordId) => getChordControl(chordId).visible);
    const nextVisible = !hasVisibleChord;
    const nextChords = { ...state.chords };

    chordIds.forEach((chordId) => {
        nextChords[chordId] = {
            ...getChordControl(chordId),
            visible: nextVisible,
        };
    });

    state = {
        ...state,
        sections: {
            ...state.sections,
            [sectionId]: {
                ...getSectionControl(sectionId),
                visible: nextVisible,
            },
        },
        chords: nextChords,
    };

    emit();
}

function getSectionSnapshot(sectionId: string) {
    return state.sections[sectionId] ?? createDefaultControl();
}

function clearAllSolo(
    sections = state.sections,
    chords = state.chords,
) {
    return {
        sections: Object.fromEntries(
            Object.entries(sections).map(([id, control]) => [
                id,
                control.solo ? { ...control, solo: false } : control,
            ]),
        ),
        chords: Object.fromEntries(
            Object.entries(chords).map(([id, control]) => [
                id,
                control.solo ? { ...control, solo: false } : control,
            ]),
        ),
    };
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

export function toggleSectionMuteGroup(scope: ArrangementSectionScope) {
    const { sectionId, chordIds } = scope;

    if (chordIds.length === 0) {
        toggleSectionMute(sectionId);
        return;
    }

    const allMuted = chordIds.every((chordId) => getChordControl(chordId).mute);
    const nextMuted = !allMuted;
    let nextSections = {
        ...state.sections,
        [sectionId]: {
            ...getSectionSnapshot(sectionId),
            mute: nextMuted,
        },
    };
    let nextChords = { ...state.chords };

    chordIds.forEach((chordId) => {
        nextChords[chordId] = {
            ...getChordControl(chordId),
            mute: nextMuted,
        };
    });

    if (!nextMuted) {
        const cleared = clearAllSolo(nextSections, nextChords);
        nextSections = cleared.sections;
        nextChords = cleared.chords;
    }

    state = {
        ...state,
        sections: nextSections,
        chords: nextChords,
    };

    emit();
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

export function toggleChordSoloInSection(
    sectionId: string,
    chordId: string,
    chordIds: string[],
) {
    const active = getChordControl(chordId).solo;
    const cleared = clearAllSolo();
    const nextChords = { ...cleared.chords };

    chordIds.forEach((id) => {
        nextChords[id] = {
            ...getChordControl(id),
            solo: !active && id === chordId,
            mute: active ? false : id !== chordId,
        };
    });

    state = {
        ...state,
        sections: {
            ...cleared.sections,
            [sectionId]: {
                ...getSectionSnapshot(sectionId),
                solo: false,
                mute: false,
            },
        },
        chords: nextChords,
    };

    emit();
}

export function toggleSectionSoloGroup(
    sectionId: string,
    scopes: ArrangementSectionScope[],
) {
    const active = getSectionSnapshot(sectionId).solo;
    const cleared = clearAllSolo();
    const nextSections = { ...cleared.sections };
    const nextChords = { ...cleared.chords };

    scopes.forEach((scope) => {
        const isTargetSection = scope.sectionId === sectionId;

        nextSections[scope.sectionId] = {
            ...getSectionSnapshot(scope.sectionId),
            solo: !active && isTargetSection,
            mute: active ? false : !isTargetSection,
        };

        scope.chordIds.forEach((chordId) => {
            nextChords[chordId] = {
                ...getChordControl(chordId),
                solo: false,
                mute: active ? false : !isTargetSection,
            };
        });
    });

    state = {
        ...state,
        sections: nextSections,
        chords: nextChords,
    };

    emit();
}

export function toggleChordMute(chordId: string) {
    const nextMuted = !getChordControl(chordId).mute;
    let nextSections = state.sections;
    let nextChords = {
        ...state.chords,
        [chordId]: {
            ...getChordControl(chordId),
            mute: nextMuted,
        },
    };

    if (!nextMuted) {
        const cleared = clearAllSolo(nextSections, nextChords);
        nextSections = cleared.sections;
        nextChords = cleared.chords;
    }

    state = {
        ...state,
        sections: nextSections,
        chords: nextChords,
    };

    emit();
}
