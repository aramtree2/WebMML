import { DialogFrame } from "./DialogFrame";

type ImportDialogProps = {
    onClose: () => void;
};

export function ImportDialog({ onClose }: ImportDialogProps) {
    return (
        <DialogFrame title="가져오기" onClose={onClose} onConfirm={() => {}}>
            <div>
                <p>MML 또는 MIDI 파일을 선택하고 가져오기 설정을 확인하는 영역입니다.</p>
            </div>
        </DialogFrame>
    );
}
