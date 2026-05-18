import { useState } from "react";
import { updateWmlProject } from "../../../core/wml/wmlStore";
import type { NoteEvent } from "../../../core/wml/wmlTypes";
import type { EventEditorProps, EventEditorTarget } from "../eventEditorTypes";

type NoteTarget = Extract<EventEditorTarget, { type: "note" }>;

export function NoteEditor({ target, project, onClose }: EventEditorProps<NoteTarget>) {
    const currentNote = project.sections
        .find((section) => section.id === target.sectionId)
        ?.chords.find((chord) => chord.id === target.chordId)
        ?.notes.find((note) => note.id === target.noteId);
    const [velocity, setVelocity] = useState(currentNote?.velocity ?? 8);
    const [applyUntilNextChange, setApplyUntilNextChange] = useState(true);

    const applyChanges = () => {
        const nextVelocity = clampVelocity(velocity);

        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === target.sectionId
                    ? {
                          ...section,
                          chords: section.chords.map((chord) =>
                              chord.id === target.chordId
                                  ? {
                                        ...chord,
                                        notes: chord.notes.map((note) =>
                                            shouldUpdateVelocity(
                                                note,
                                                chord.notes,
                                                target.noteId,
                                                applyUntilNextChange,
                                            )
                                                ? {
                                                      ...note,
                                                      velocity: nextVelocity,
                                                  }
                                                : note,
                                        ),
                                    }
                                  : chord,
                          ),
                      }
                    : section,
            ),
        }));

        onClose();
    };

    const deleteNote = () => {
        updateWmlProject((prev) => ({
            ...prev,
            sections: prev.sections.map((section) =>
                section.id === target.sectionId
                    ? {
                          ...section,
                          chords: section.chords.map((chord) =>
                              chord.id === target.chordId
                                  ? {
                                        ...chord,
                                        notes: chord.notes.filter((note) => note.id !== target.noteId),
                                    }
                                  : chord,
                          ),
                      }
                    : section,
            ),
        }));

        onClose();
    };

    return (
        <div className="event-editor-form">
            <label className="event-editor-field">
                <span className="event-editor-label">볼륨</span>
                <input
                    type="number"
                    min={0}
                    max={15}
                    step={1}
                    value={velocity}
                    onChange={(e) => setVelocity(Number(e.target.value))}
                />
            </label>
            <label className="event-editor-checkbox-field">
                <input
                    type="checkbox"
                    checked={applyUntilNextChange}
                    onChange={(e) => setApplyUntilNextChange(e.target.checked)}
                />
                <span>다음 볼륨 변화까지 일괄 적용</span>
            </label>
            <div className="event-editor-actions">
                <button
                    type="button"
                    className="event-editor-danger-button"
                    onClick={deleteNote}
                >
                    삭제
                </button>
                <button type="button" onClick={onClose}>
                    취소
                </button>
                <button
                    type="button"
                    className="event-editor-primary-button"
                    onClick={applyChanges}
                >
                    확인
                </button>
            </div>
        </div>
    );
}

function clampVelocity(value: number) {
    if (!Number.isFinite(value)) return 8;

    return Math.max(0, Math.min(15, Math.round(value)));
}

function shouldUpdateVelocity(
    note: NoteEvent,
    notes: NoteEvent[],
    targetNoteId: string,
    applyUntilNextChange: boolean,
) {
    if (!applyUntilNextChange) {
        return note.id === targetNoteId;
    }

    const sorted = [...notes].sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
    const targetIndex = sorted.findIndex((candidate) => candidate.id === targetNoteId);
    if (targetIndex < 0) return false;

    const targetVelocity = clampVelocity(sorted[targetIndex].velocity);
    const nextChange = sorted
        .slice(targetIndex + 1)
        .find((candidate) => clampVelocity(candidate.velocity) !== targetVelocity);
    const targetTick = sorted[targetIndex].tick;

    if (note.tick < targetTick) return false;
    if (nextChange && note.tick >= nextChange.tick) return false;

    return sorted.some((candidate) => candidate.id === note.id);
}
