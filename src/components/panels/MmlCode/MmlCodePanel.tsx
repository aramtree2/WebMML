import { useState } from "react";

import { getWmlProject } from "../../../core/wml/wmlStore";
import { wmlToJson } from "../../../core/wml/wmlUtils";

export function MmlCodePanel() {
    const [reloadKey, setReloadKey] = useState(0);

    const project = getWmlProject();

    return (
        <div
            className="panel-content"
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                minHeight: 0,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    padding: "4px",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    flex: "0 0 auto",
                }}
            >
                <button
                    type="button"
                    onClick={() => setReloadKey((v) => v + 1)}
                    style={{
                        padding: "4px 10px",
                        cursor: "pointer",
                    }}
                >
                    리로드
                </button>
            </div>

            <div
                style={{
                    overflow: "auto",
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
                <pre
                    key={reloadKey}
                    style={{
                        margin: 0,
                        width: "100%",
                        boxSizing: "border-box",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}
                >
                    {wmlToJson(project)}
                </pre>
            </div>
        </div>
    );
}
