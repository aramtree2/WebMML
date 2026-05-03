import { useEffect, useMemo } from "react";
import "./App.css";
import { EditorShell } from "./components/editor/EditorShell";
import { createDefaultLayoutState, normalizeLayoutState } from "./layouts/defaultLayout";
import { loadLayoutState, saveLayoutState } from "./storage/layoutStorage";
import { useDockingLayout } from "./hooks/useDockingLayout";

function App() {
    const initialLayoutState = useMemo(() => {
        const savedLayoutState = loadLayoutState();

        if (savedLayoutState) {
            return normalizeLayoutState(savedLayoutState);
        }

        return createDefaultLayoutState();
    }, []);

    const docking = useDockingLayout(initialLayoutState);

    useEffect(() => {
        saveLayoutState({
            mainLayout: docking.mainLayout,
            floating: docking.floating,
        });
    }, [docking.mainLayout, docking.floating]);

    return <EditorShell docking={docking} />;
}

export default App;
