import { useEffect, useRef, useState } from "react";
import "../../styles/MenuBar.css";
import { PANEL_IDS, PANEL_TITLES, type PanelId } from "../../constants/panels";
import type { DialogType } from "../../types/dialog";
import type { DockingLayoutController } from "../../hooks/useDockingLayout";

type MenuBarProps = {
    docking: DockingLayoutController;
    onOpenDialog: (type: DialogType) => void;
};

const VIEW_MENU_PANELS: PanelId[] = [
    PANEL_IDS.PALETTE,
    PANEL_IDS.PIANO_ROLL,
    PANEL_IDS.SCORE,
    PANEL_IDS.VIRTUAL_PIANO,
    PANEL_IDS.INSTRUMENT,
    PANEL_IDS.MML_CODE,
    PANEL_IDS.PLAYBACK,
];

export function MenuBar({ docking, onOpenDialog }: MenuBarProps) {
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenu(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleMenu = (menuName: string) => {
        setOpenMenu(openMenu === menuName ? null : menuName);
    };

    const closeMenu = () => {
        setOpenMenu(null);
    };

    const openDialog = (type: DialogType) => {
        onOpenDialog(type);
        closeMenu();
    };

    return (
        <nav className="menu-bar" ref={menuRef} aria-label="주 메뉴">
            <div className="menu-wrapper">
                <button
                    className="menu-trigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "file"}
                    onClick={() => toggleMenu("file")}
                >
                    파일
                </button>
                {openMenu === "file" && (
                    <div className="dropdown-menu" role="menu">
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("새로 만들기"); closeMenu(); }}>새로 만들기</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("열기"); closeMenu(); }}>열기</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("저장"); closeMenu(); }}>저장</button>
                        <div className="menu-separator" role="separator" />
                        <button className="menu-item" type="button" role="menuitem" onClick={() => openDialog("import")}>가져오기</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => openDialog("export")}>내보내기</button>
                    </div>
                )}
            </div>

            <div className="menu-wrapper">
                <button
                    className="menu-trigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "edit"}
                    onClick={() => toggleMenu("edit")}
                >
                    편집
                </button>
                {openMenu === "edit" && (
                    <div className="dropdown-menu" role="menu">
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("퀀타이징"); closeMenu(); }}>퀀타이징</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("옥타브 이동"); closeMenu(); }}>옥타브 이동</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("마디 추가"); closeMenu(); }}>마디 추가</button>
                        <button className="menu-item" type="button" role="menuitem" onClick={() => { console.log("마디 삭제"); closeMenu(); }}>마디 삭제</button>
                    </div>
                )}
            </div>

            <div className="menu-wrapper">
                <button
                    className="menu-trigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={openMenu === "view"}
                    onClick={() => toggleMenu("view")}
                >
                    보기
                </button>
                {openMenu === "view" && (
                    <div className="dropdown-menu view-menu" role="menu">
                        {VIEW_MENU_PANELS.map((panelId) => {
                            const isChecked = docking.visiblePanelIds.has(panelId);
                            const isDisabled = isChecked && !docking.canHidePanel(panelId);

                            return (
                            <label
                                key={panelId}
                                className={`dropdown-item checkbox-item${isDisabled ? " disabled" : ""}`}
                            >
                                <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => docking.togglePanelVisibility(panelId)}
                                />
                                <span>{PANEL_TITLES[panelId]}</span>
                            </label>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="menu-wrapper">
                <button className="menu-trigger" type="button" onClick={() => openDialog("settings")}>설정</button>
            </div>
        </nav>
    );
}
