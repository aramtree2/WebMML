import type { DialogType } from "../../types/dialog";

type MenuBarProps = {
    onOpenDialog: (type: DialogType) => void;
};

export function MenuBar({ onOpenDialog }: MenuBarProps) {
    return (
        <div className="menu-bar">
            <button>파일</button>
            <button>편집</button>
            <button>보기</button>

            <button onClick={() => onOpenDialog("import")}>가져오기</button>
            <button onClick={() => onOpenDialog("export")}>내보내기</button>
            <button onClick={() => onOpenDialog("settings")}>설정</button>
        </div>
    );
}
