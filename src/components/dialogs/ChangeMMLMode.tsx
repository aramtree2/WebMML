import { DialogFrame } from "./DialogFrame";

type ChangeMMLModeProps = {
    enabled: boolean;
    onClose: () => void;
};

export function ChangeMMLMode({ enabled, onClose }: ChangeMMLModeProps) {
    return (
        <DialogFrame title="MML 모드 변경" onClose={onClose}>
            <div>
                MML 모드가 {enabled ? "켜졌습니다." : "꺼졌습니다."}
            </div>
        </DialogFrame>
    );
}
