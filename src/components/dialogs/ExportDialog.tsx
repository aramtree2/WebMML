import { DialogFrame } from "./DialogFrame";

type ExportDialogProps = {
    onClose: () => void;
};

export function ExportDialog({ onClose }: ExportDialogProps) {
    return (
        <DialogFrame title="내보내기" onClose={onClose} onConfirm={() => {}}>
            <div>
                <p>내보낼 트랙과 파일 형식을 선택하는 영역입니다.</p>
            </div>
        </DialogFrame>
    );
}
