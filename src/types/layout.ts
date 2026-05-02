import type React from "react";

export type Direction = "left" | "right" | "top" | "bottom" | "center";
export type EdgeDirection = "left" | "right" | "top" | "bottom";

export type LayoutNode =
    | { type: "tabs"; ids: string[]; activeId: string }
    | {
          type: "split";
          direction: "row" | "column";
          children: LayoutNode[];
          sizes?: number[];
      };

export type FloatingWindow = {
    id: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
    layout: LayoutNode;
};

export type DragInfo = {
    panelId: string;
    sourceWindowId: string | "main";
} | null;

export type DropPreview = {
    targetId: string;
    direction: Direction;
} | null;

export type EdgePreview = {
    targetWindowId: string | "main";
    direction: EdgeDirection;
    rect: React.CSSProperties;
} | null;

export type EditorLayoutState = {
    mainLayout: LayoutNode;
    floating: FloatingWindow[];
};
