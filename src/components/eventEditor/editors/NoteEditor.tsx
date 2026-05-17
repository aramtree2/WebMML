import type { EventEditorProps, EventEditorTarget } from "../eventEditorTypes";

type NoteTarget = Extract<EventEditorTarget, { type: "note" }>;

export function NoteEditor({ target }: EventEditorProps<NoteTarget>) {
    return (
        <div className="event-editor-placeholder">
            <div className="event-editor-placeholder-row">
                <span className="event-editor-placeholder-label">Note</span>
                <span className="event-editor-placeholder-value">{target.noteId}</span>
            </div>
            <div className="event-editor-placeholder-row">
                <span className="event-editor-placeholder-label">Section</span>
                <span className="event-editor-placeholder-value">{target.sectionId}</span>
            </div>
            <div className="event-editor-placeholder-row">
                <span className="event-editor-placeholder-label">Chord</span>
                <span className="event-editor-placeholder-value">{target.chordId}</span>
            </div>
        </div>
    );
}
