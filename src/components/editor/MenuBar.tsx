import { useState, useRef, useEffect } from "react";
import "../../styles/MenuBar.css";
import type { DialogType } from "../../types/dialog";

type MenuBarProps = {
    onOpenDialog: (type: DialogType) => void;
};

export function MenuBar({ onOpenDialog }: MenuBarProps) {
    // 1. 어떤 메뉴 드롭다운이 열려있는지 추적 ("file", "edit", "view" 또는 null)
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // 2. 보기 메뉴의 체크박스 On/Off 상태 관리 (일단 전부 켜져 있는 상태로 초기화)
    const [viewOptions, setViewOptions] = useState({
        "팔레트": true,
        "피아노 롤": true,
        "악보": true,
        "가상 피아노": true,
        "악기 구성": true,
        "MML 코드 표": true,
        "재생 패널": true,
    });

    // 메뉴 바깥을 클릭하면 드롭다운이 닫히는 기능
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 특정 메뉴 탭(파일, 편집, 보기) 열기/닫기 토글
    const toggleMenu = (menuName: string) => {
        setOpenMenu(openMenu === menuName ? null : menuName);
    };

    // 보기 메뉴의 체크박스 상태 반전 (on -> off, off -> on)
    const handleViewOptionToggle = (optionName: keyof typeof viewOptions) => {
        setViewOptions(prev => ({
            ...prev,
            [optionName]: !prev[optionName]
        }));
    };

    return (
        <div className="menu-bar" ref={menuRef}>
            {/* --- 파일 메뉴 --- */}
            <div className="menu-wrapper">
                <button onClick={() => toggleMenu("file")}>파일</button>
                {openMenu === "file" && (
                    <div className="dropdown-menu">
                        <button onClick={() => { console.log("새로 만들기"); setOpenMenu(null); }}>새로 만들기</button>
                        <button onClick={() => { console.log("열기"); setOpenMenu(null); }}>열기</button>
                        <button onClick={() => { console.log("저장"); setOpenMenu(null); }}>저장</button>
                    </div>
                )}
            </div>

            {/* --- 편집 메뉴 --- */}
            <div className="menu-wrapper">
                <button onClick={() => toggleMenu("edit")}>편집</button>
                {openMenu === "edit" && (
                    <div className="dropdown-menu">
                        <button onClick={() => { console.log("퀀타이징"); setOpenMenu(null); }}>퀀타이징</button>
                        <button onClick={() => { console.log("옥타브 이동"); setOpenMenu(null); }}>옥타브 이동</button>
                        <button onClick={() => { console.log("마디 추가"); setOpenMenu(null); }}>마디 추가</button>
                        <button onClick={() => { console.log("마디 삭제"); setOpenMenu(null); }}>마디 삭제</button>
                    </div>
                )}
            </div>

            {/* --- 보기 메뉴 (체크박스형) --- */}
            <div className="menu-wrapper">
                <button onClick={() => toggleMenu("view")}>보기</button>
                {openMenu === "view" && (
                    <div className="dropdown-menu view-menu">
                        {/* Object.entries를 사용해 viewOptions 상태를 리스트로 쭉 뽑아냅니다 */}
                        {Object.entries(viewOptions).map(([option, isChecked]) => (
                            <label key={option} className="dropdown-item checkbox-item">
                                <input 
                                    type="checkbox" 
                                    checked={isChecked} 
                                    onChange={() => handleViewOptionToggle(option as keyof typeof viewOptions)}
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* --- 기존 기능 연결 버튼 --- */}
            <button onClick={() => onOpenDialog("import")}>가져오기</button>
            <button onClick={() => onOpenDialog("export")}>내보내기</button>
            <button onClick={() => onOpenDialog("settings")}>설정</button>
        </div>
    );
}