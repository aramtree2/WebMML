import { useState, useEffect, useRef } from "react";
import {
    getWmlProject,
    setWmlProject,
    subscribeWmlProject
} from "../../../../core/wml/wmlStore";

export function WMLEditorPanel() {
    const [textValue, setTextValue] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isDirty, setIsDirty] = useState(false); 
    
    const isDirtyRef = useRef(false);

    const loadFromStore = () => {
        const project = getWmlProject();
        setTextValue(JSON.stringify(project, null, 2));
        setError(null);
        setIsSuccess(false);
        setIsDirty(false);
        isDirtyRef.current = false;
    };

    useEffect(() => {
        loadFromStore(); 

        const unsubscribe = subscribeWmlProject((newProject) => {
            if (!isDirtyRef.current) {
                setTextValue(JSON.stringify(newProject, null, 2));
            }
        });

        return () => unsubscribe();
    }, []);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTextValue(e.target.value);
        setIsDirty(true);
        isDirtyRef.current = true;
        setError(null);
        setIsSuccess(false);
    };

    const handleApply = () => {
        try {
            const parsedData = JSON.parse(textValue);
            
            setWmlProject(parsedData);
            
            setIsDirty(false);
            isDirtyRef.current = false;
            setError(null);
            setIsSuccess(true);
            
            setTimeout(() => setIsSuccess(false), 2000);
        } catch (err) {
            setError((err as Error).message);
            setIsSuccess(false);
        }
    };

    return (
        <div
            className="panel-content"
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
                backgroundColor: "#ffffff",
                color: "#333333" 
            }}
        >
            {/* 상단 컨트롤 바 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "4px 8px",
                    borderBottom: "1px solid #e9ecef",
                    flex: "0 0 auto",
                    backgroundColor: "#f8f9fa"
                }}
            >
                <span style={{ 
                    color: error ? "#e03131" : isSuccess ? "#2b8a3e" : isDirty ? "#e67700" : "#868e96", 
                    fontSize: "12px",
                    fontFamily: "monospace",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "60%"
                }}>
                    {error ? `에러: ${error}` : 
                     isSuccess ? "적용 완료" : 
                     isDirty ? "수정 중..." : 
                     ""}
                </span>

                <div style={{ display: "flex", gap: "6px" }}>
                    <button
                        type="button"
                        onClick={loadFromStore}
                        style={{
                            padding: "4px 10px",
                            cursor: "pointer",
                            backgroundColor: "#ffffff",
                            color: "#333333",
                            border: "1px solid #ced4da",
                            borderRadius: "4px",
                            fontSize: "12px"
                        }}
                        title="기존 데이터로 되돌리기"
                    >
                        리로드
                    </button>
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={!isDirty && !error}
                        style={{
                            padding: "4px 10px",
                            cursor: (!isDirty && !error) ? "not-allowed" : "pointer",
                            backgroundColor: (!isDirty && !error) ? "#e9ecef" : "#228be6",
                            color: (!isDirty && !error) ? "#adb5bd" : "white",
                            border: (!isDirty && !error) ? "1px solid #dee2e6" : "1px solid #1c7ed6",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            transition: "all 0.2s"
                        }}
                    >
                        적용하기
                    </button>
                </div>
            </div>

            {/* JSON 편집 영역 */}
            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
                <textarea
                    value={textValue}
                    onChange={handleTextChange}
                    onKeyDown={(e) => e.stopPropagation()}
                    onKeyUp={(e) => e.stopPropagation()}
                    onKeyPress={(e) => e.stopPropagation()}
                    spellCheck={false}
                    style={{
                        margin: 0,
                        width: "100%",
                        height: "100%",
                        boxSizing: "border-box",
                        whiteSpace: "pre",
                        fontFamily: "'Consolas', 'Courier New', monospace",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        backgroundColor: "#ffffff",
                        color: "#212529",
                        padding: "12px",
                        border: "none",
                        outline: "none",
                        resize: "none",
                    }}
                />
            </div>
        </div>
    );
}