import type React from "react";

type DialogFrameProps = {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
    onConfirm?: () => void;
};

export function DialogFrame({ title, children, onClose, onConfirm }: DialogFrameProps) {
    return (
        <div className="dialog-overlay">
            <div className="dialog">
                <div className="dialog-header">
                    <span>{title}</span>
                    <button onClick={onClose}>×</button>
                </div>

                <div className="dialog-body">{children}</div>

                <div className="dialog-footer">
                    {onConfirm && <button onClick={onConfirm}>확인</button>}
                    <button onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
}
