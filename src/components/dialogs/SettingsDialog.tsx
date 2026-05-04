import { DialogFrame } from "./DialogFrame";

type SettingsDialogProps = {
    onClose: () => void;
};

export function SettingsDialog({ onClose }: SettingsDialogProps) {
    return (
        <DialogFrame title="설정" onClose={onClose} onConfirm={() => {}}>
            <div>
                <p>앱 설정을 변경하는 영역입니다.</p>
            </div>
        </DialogFrame>
    );
}
