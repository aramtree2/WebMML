import { getWmlProject } from "../../../core/wml/wmlStore";
import { wmlToJson } from "../../../core/wml/wmlUtils";

export function PianoRollPanel() {
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
                    overflow: "auto",
                    flex: 1,
                    minHeight: 0,
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
                <pre
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