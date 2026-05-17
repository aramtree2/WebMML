import { NoteEditor } from "./editors/NoteEditor";
import { TempoEditor } from "./editors/TempoEditor";
import { TimeSignatureEditor } from "./editors/TimeSignatureEditor";
import type { EventEditorAnchor, EventEditorTarget } from "./eventEditorTypes";
import type { WmlProject } from "../../core/wml/wmlTypes";
import "./EventEditorFloatingWindow.css";

type EventEditorFloatingWindowProps = {
    target: EventEditorTarget | null;
    anchor?: EventEditorAnchor | null;
    bounds?: {
        width: number;
        height: number;
    } | null;
    project: WmlProject;
    onClose: () => void;
    onCancel?: () => void;
};

const WINDOW_WIDTH = 260;
const WINDOW_MIN_HEIGHT = 170;
const WINDOW_MARGIN = 8;

const DEFAULT_WINDOW_POSITION: EventEditorAnchor = {
    x: 96,
    y: 56,
};

export function EventEditorFloatingWindow({
    target,
    anchor,
    bounds,
    project,
    onClose,
    onCancel,
}: EventEditorFloatingWindowProps) {
    if (target == null) return null;

    const position = clampWindowPosition(anchor ?? DEFAULT_WINDOW_POSITION, bounds);

    return (
        <div
            className="event-editor-window"
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            <div className="event-editor-titlebar">
                <span>{getEditorTitle(target)}</span>
                <button
                    type="button"
                    className="event-editor-close-button"
                    onClick={onCancel ?? onClose}
                    aria-label="Close event editor"
                >
                    ×
                </button>
            </div>

            <div className="event-editor-body">
                {target.type === "timeSignature" && (
                    <TimeSignatureEditor
                        target={target}
                        project={project}
                        onClose={onClose}
                    />
                )}
                {target.type === "tempo" && (
                    <TempoEditor
                        target={target}
                        project={project}
                        onClose={onClose}
                    />
                )}
                {target.type === "note" && (
                    <NoteEditor
                        target={target}
                        project={project}
                        onClose={onClose}
                    />
                )}
            </div>
        </div>
    );
}

function getEditorTitle(target: EventEditorTarget) {
    switch (target.type) {
        case "timeSignature":
            return "Time Signature";
        case "tempo":
            return "Tempo";
        case "note":
            return "Note";
    }
}

function clampWindowPosition(
    position: EventEditorAnchor,
    bounds: EventEditorFloatingWindowProps["bounds"],
) {
    if (!bounds) return position;

    return {
        x: clamp(position.x, WINDOW_MARGIN, bounds.width - WINDOW_WIDTH - WINDOW_MARGIN),
        y: clamp(position.y, WINDOW_MARGIN, bounds.height - WINDOW_MIN_HEIGHT - WINDOW_MARGIN),
    };
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;

    return Math.min(max, Math.max(min, value));
}
