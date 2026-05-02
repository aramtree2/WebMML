import { useEffect, useMemo } from "react";
import "./App.css";
import { EditorShell } from "./components/editor/EditorShell";
import { createDefaultLayoutState } from "./layouts/defaultLayout";
import { loadLayoutState, saveLayoutState } from "./storage/layoutStorage";
import { useDockingLayout } from "./hooks/useDockingLayout";

function App() {
    const initialLayoutState = useMemo(() => {
        return loadLayoutState() ?? createDefaultLayoutState();
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
