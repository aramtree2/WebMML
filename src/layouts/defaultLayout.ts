import type { EditorLayoutState, LayoutNode } from "../types/layout";

export const initialMainLayout: LayoutNode = {
    type: "split",
    direction: "row",
    children: [
        { type: "tabs", ids: ["팔레트"], activeId: "팔레트" },
        {
            type: "split",
            direction: "column",
            children: [
                {
                    type: "split",
                    direction: "row",
                    children: [
                        { type: "tabs", ids: ["피아노 롤"], activeId: "피아노 롤" },
                        { type: "tabs", ids: ["악보"], activeId: "악보" },
                    ],
                    sizes: [50, 50],
                },
                { type: "tabs", ids: ["가상 피아노"], activeId: "가상 피아노" },
            ],
            sizes: [65, 35],
        },
        {
            type: "split",
            direction: "column",
            children: [
                { type: "tabs", ids: ["악기 구성"], activeId: "악기 구성" },
                { type: "tabs", ids: ["mml 코드 표"], activeId: "mml 코드 표" },
                { type: "tabs", ids: ["재생 패널"], activeId: "재생 패널" },
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
