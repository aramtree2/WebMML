import { getPanelTitle, normalizePanelId, PANEL_IDS } from "../constants/panels";
import type { EditorLayoutState, LayoutNode } from "../types/layout";

function normalizeLayoutNode(node: LayoutNode): LayoutNode {
    if (node.type === "tabs") {
        const ids = node.ids.map((id) => normalizePanelId(id));
        const activeId = normalizePanelId(node.activeId);
        const safeActiveId = ids.includes(activeId) ? activeId : ids[0];

        return {
            type: "tabs",
            ids,
            activeId: safeActiveId,
        };
    }

    return {
        ...node,
        children: node.children.map((child) => normalizeLayoutNode(child)),
    };
}

export function normalizeLayoutState(state: EditorLayoutState): EditorLayoutState {
    return {
        mainLayout: normalizeLayoutNode(state.mainLayout),
        floating: state.floating.map((win) => ({
            ...win,
            title: getPanelTitle(win.title),
            layout: normalizeLayoutNode(win.layout),
        })),
    };
}

export const initialMainLayout: LayoutNode = {
    type: "split",
    direction: "row",
    children: [
        { type: "tabs", ids: [PANEL_IDS.PALETTE], activeId: PANEL_IDS.PALETTE },
        {
            type: "split",
            direction: "column",
            children: [
                {
                    type: "split",
                    direction: "row",
                    children: [
                        { type: "tabs", ids: [PANEL_IDS.PIANO_ROLL], activeId: PANEL_IDS.PIANO_ROLL },
                        { type: "tabs", ids: [PANEL_IDS.SCORE], activeId: PANEL_IDS.SCORE },
                    ],
                    sizes: [50, 50],
                },
                { type: "tabs", ids: [PANEL_IDS.VIRTUAL_PIANO], activeId: PANEL_IDS.VIRTUAL_PIANO },
            ],
            sizes: [65, 35],
        },
        {
            type: "split",
            direction: "column",
            children: [
                { type: "tabs", ids: [PANEL_IDS.INSTRUMENT], activeId: PANEL_IDS.INSTRUMENT },
                { type: "tabs", ids: [PANEL_IDS.MML_CODE], activeId: PANEL_IDS.MML_CODE },
                { type: "tabs", ids: [PANEL_IDS.PLAYBACK], activeId: PANEL_IDS.PLAYBACK },
            ],
            sizes: [33.3, 33.3, 33.4],
        },
    ],
    sizes: [22, 53, 25],
};

export function createDefaultLayoutState(): EditorLayoutState {
    return {
        mainLayout: structuredClone(initialMainLayout),
        floating: [],
    };
}
