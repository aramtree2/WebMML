import type { WmlProject } from "../../core/wml/wmlTypes";

export type EventEditorTarget =
    | {
          type: "timeSignature";
          bar: number;
          eventId?: string;
      }
    | {
          type: "tempo";
          tick: number;
          eventId?: string;
          isNew?: boolean;
      }
    | {
          type: "note";
          noteId: string;
          sectionId: string;
          chordId: string;
      };

export type EventEditorAnchor = {
    x: number;
    y: number;
};

export type EventEditorProps<TTarget extends EventEditorTarget = EventEditorTarget> = {
    target: TTarget;
    project: WmlProject;
    onClose: () => void;
};
