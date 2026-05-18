import type { WmlProject, WmlSection, Chord, NoteEvent } from "./wmlTypes";
import { createId } from "./wmlUtils";

type MmlModeNote = NoteEvent & {
    mmlModeVoiceIndex?: number;
};

type Voice = {
    notes: MmlModeNote[];
    lastEndTick: number;
};

export function convertWmlToMmlMode(project: WmlProject): WmlProject {
    return {
        ...project,
        sections: project.sections.map(convertSectionToMmlMode),
    };
}

function convertSectionToMmlMode(section: WmlSection): WmlSection {
    const allNotes = section.chords
        .flatMap((chord) => chord.notes ?? [])
        .map((note) => note as MmlModeNote)
        .slice()
        .sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.pitch - b.pitch;
        });

    return {
        ...section,
        chords: splitNotesToNonOverlappingChords(allNotes),
    };
}



function splitNotesToNonOverlappingChords(notes: MmlModeNote[]): Chord[] {
    const voices: Voice[] = [];

    for (const note of notes) {
        const startTick = note.tick;
        const endTick = note.tick + note.duration;

        let targetVoice = voices.find((voice) => voice.lastEndTick <= startTick);

        if (!targetVoice) {
            targetVoice = {
                notes: [],
                lastEndTick: 0,
            };

            voices.push(targetVoice);
        }

        targetVoice.notes.push({
            ...note,
            id: note.id ?? createId("note"),
        });

        targetVoice.lastEndTick = Math.max(targetVoice.lastEndTick, endTick);
    }

    return voices.map((voice, voiceIndex) => ({
        id: createId("chord"),
        notes: voice.notes
            .map((note) => ({
                ...note,
                mmlModeVoiceIndex: voiceIndex,
            }))
            .sort((a, b) => {
                if (a.tick !== b.tick) return a.tick - b.tick;
                return a.pitch - b.pitch;
            }),
    }));
}

export function convertWmlToNormalMode(project: WmlProject): WmlProject {
    return {
        ...project,
        sections: project.sections.map(convertSectionToNormalMode),
    };
}

function convertSectionToNormalMode(section: WmlSection): WmlSection {
    const allNotes = section.chords
        .flatMap((chord, chordIndex) =>
            (chord.notes ?? []).map((note) => ({
                ...(note as MmlModeNote),
                mmlModeVoiceIndex:
                    typeof (note as MmlModeNote).mmlModeVoiceIndex === "number"
                        ? (note as MmlModeNote).mmlModeVoiceIndex
                        : chordIndex,
            }))
        )
        .sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.pitch - b.pitch;
        });

    return {
        ...section,
        chords: [
            {
                id: createId("chord"),
                notes: allNotes,
            },
        ],
    };
}

export function canConvertToMmlMode(project: WmlProject): string | null {
    if (!project || !Array.isArray(project.sections)) {
        return "올바른 WML 프로젝트가 아닙니다.";
    }

    if (project.sections.length === 0) {
        return "변환할 섹션이 없습니다.";
    }

    for (const section of project.sections) {
        if (!Array.isArray(section.chords)) {
            return "화음 구조가 올바르지 않습니다.";
        }

        for (const chord of section.chords) {
            if (!Array.isArray(chord.notes)) {
                return "노트 구조가 올바르지 않습니다.";
            }

            if (chord.notes.length === 0) {
                return "비어 있는 화음이 있어 MML 모드로 변환할 수 없습니다.";
            }
        }
    }

    return null;
}