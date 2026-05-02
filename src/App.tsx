import React, { useState } from "react";
import "./App.css";

type Direction = "left" | "right" | "top" | "bottom" | "center";
type EdgeDirection = "left" | "right" | "top" | "bottom";

type LayoutNode =
  | { type: "tabs"; ids: string[]; activeId: string }
  | {
      type: "split";
      direction: "row" | "column";
      children: LayoutNode[];
      sizes?: number[];
    };

type FloatingWindow = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  layout: LayoutNode;
};

type DragInfo = {
  panelId: string;
  sourceWindowId: string | "main";
} | null;

type DropPreview = {
  targetId: string;
  direction: Direction;
} | null;

type EdgePreview = {
  targetWindowId: string | "main";
  direction: EdgeDirection;
  rect: React.CSSProperties;
} | null;

const initialMainLayout: LayoutNode = {
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

function cloneNode(node: LayoutNode): LayoutNode {
  return JSON.parse(JSON.stringify(node));
}

function countPanels(node: LayoutNode): number {
  if (node.type === "tabs") return node.ids.length;
  return node.children.reduce((sum, child) => sum + countPanels(child), 0);
}

function containsPanel(node: LayoutNode, id: string): boolean {
  if (node.type === "tabs") return node.ids.includes(id);
  return node.children.some((child) => containsPanel(child, id));
}

function removePanel(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.type === "tabs") {
    const ids = node.ids.filter((id) => id !== panelId);

    if (ids.length === 0) return null;

    return {
      type: "tabs",
      ids,
      activeId: ids.includes(node.activeId) ? node.activeId : ids[0],
    };
  }

  const nextChildren: LayoutNode[] = [];
  const nextSizes: number[] = [];

  node.children.forEach((child, index) => {
    const next = removePanel(child, panelId);

    if (next) {
      nextChildren.push(next);

      if (node.sizes?.[index] != null) {
        nextSizes.push(node.sizes[index]);
      }
    }
  });

  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) return nextChildren[0];

  const total = nextSizes.reduce((a, b) => a + b, 0);

  return {
    ...node,
    children: nextChildren,
    sizes:
      nextSizes.length === nextChildren.length && total > 0
        ? nextSizes.map((size) => (size / total) * 100)
        : undefined,
  };
}

function insertPanel(
  node: LayoutNode,
  targetId: string,
  panelId: string,
  direction: Direction
): LayoutNode {
  if (node.type === "tabs") {
    if (!node.ids.includes(targetId)) return node;

    if (direction === "center") {
      if (node.ids.includes(panelId)) return node;

      return {
        type: "tabs",
        ids: [...node.ids, panelId],
        activeId: panelId,
      };
    }

    const newPanel: LayoutNode = {
      type: "tabs",
      ids: [panelId],
      activeId: panelId,
    };

    const axis = direction === "left" || direction === "right" ? "row" : "column";
    const movingFirst = direction === "left" || direction === "top";

    return {
      type: "split",
      direction: axis,
      children: movingFirst ? [newPanel, node] : [node, newPanel],
      sizes: [50, 50],
    };
  }

  return {
    ...node,
    children: node.children.map((child) =>
      containsPanel(child, targetId)
        ? insertPanel(child, targetId, panelId, direction)
        : child
    ),
  };
}

function wrapLayoutByEdge(
  base: LayoutNode,
  incoming: LayoutNode,
  direction: EdgeDirection
): LayoutNode {
  if (direction === "left") {
    return {
      type: "split",
      direction: "row",
      children: [incoming, base],
      sizes: [25, 75],
    };
  }

  if (direction === "right") {
    return {
      type: "split",
      direction: "row",
      children: [base, incoming],
      sizes: [75, 25],
    };
  }

  if (direction === "top") {
    return {
      type: "split",
      direction: "column",
      children: [incoming, base],
      sizes: [25, 75],
    };
  }

  return {
    type: "split",
    direction: "column",
    children: [base, incoming],
    sizes: [75, 25],
  };
}

function getDropDirection(rect: DOMRect, x: number, y: number): Direction {
  const localX = x - rect.left;
  const localY = y - rect.top;

  const leftRatio = localX / rect.width;
  const topRatio = localY / rect.height;

  if (leftRatio < 0.28) return "left";
  if (leftRatio > 0.72) return "right";
  if (topRatio < 0.28) return "top";
  if (topRatio > 0.72) return "bottom";

  return "center";
}

function resizeSplitAtPath(
  node: LayoutNode,
  path: number[],
  splitterIndex: number,
  deltaPercent: number,
  startSizes: number[]
): LayoutNode {
  if (node.type !== "split") return node;

  if (path.length === 0) {
    const next = [...startSizes];
    const min = 8;

    const left = startSizes[splitterIndex];
    const right = startSizes[splitterIndex + 1];

    let newLeft = left + deltaPercent;
    let newRight = right - deltaPercent;

    if (newLeft < min) {
      newLeft = min;
      newRight = left + right - min;
    }

    if (newRight < min) {
      newRight = min;
      newLeft = left + right - min;
    }

    next[splitterIndex] = newLeft;
    next[splitterIndex + 1] = newRight;

    return {
      ...node,
      sizes: next,
    };
  }

  const [head, ...rest] = path;

  return {
    ...node,
    children: node.children.map((child, index) =>
      index === head
        ? resizeSplitAtPath(child, rest, splitterIndex, deltaPercent, startSizes)
        : child
    ),
  };
}

function getTargetEdgePreview(
  clientX: number,
  clientY: number,
  sourceWindowId: string | "main" | null
): EdgePreview {
  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) return null;

  const workspaceRect = workspace.getBoundingClientRect();

  const targets = Array.from(
    document.querySelectorAll<HTMLElement>("[data-dock-id]")
  );

  const edgeZone = 80;

  let best:
    | {
        targetWindowId: string | "main";
        direction: EdgeDirection;
        rect: React.CSSProperties;
        score: number;
      }
    | null = null;

  for (const target of targets) {
    const targetWindowId = target.dataset.dockId as string | "main";

    if (sourceWindowId && targetWindowId === sourceWindowId) continue;

    const rect =
      targetWindowId === "main"
        ? workspaceRect
        : target.getBoundingClientRect();

    const inside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!inside) continue;

    const dTop = clientY - rect.top;
    const dBottom = rect.bottom - clientY;
    const dLeft = clientX - rect.left;
    const dRight = rect.right - clientX;

    const min = Math.min(dTop, dBottom, dLeft, dRight);

    if (min > edgeZone) continue;

    let direction: EdgeDirection;

    if (min === dTop) direction = "top";
    else if (min === dBottom) direction = "bottom";
    else if (min === dLeft) direction = "left";
    else direction = "right";

    const baseLeft = rect.left - workspaceRect.left;
    const baseTop = rect.top - workspaceRect.top;

    let previewRect: React.CSSProperties;

    if (direction === "left") {
      previewRect = {
        left: baseLeft,
        top: baseTop,
        width: rect.width * 0.25,
        height: rect.height,
      };
    } else if (direction === "right") {
      previewRect = {
        left: baseLeft + rect.width * 0.75,
        top: baseTop,
        width: rect.width * 0.25,
        height: rect.height,
      };
    } else if (direction === "top") {
      previewRect = {
        left: baseLeft,
        top: baseTop,
        width: rect.width,
        height: rect.height * 0.25,
      };
    } else {
      previewRect = {
        left: baseLeft,
        top: baseTop + rect.height * 0.75,
        width: rect.width,
        height: rect.height * 0.25,
      };
    }

    if (!best || min < best.score) {
      best = {
        targetWindowId,
        direction,
        rect: previewRect,
        score: min,
      };
    }
  }

  if (!best) return null;

  return {
    targetWindowId: best.targetWindowId,
    direction: best.direction,
    rect: best.rect,
  };
}

function App() {
  const [mainLayout, setMainLayout] = useState<LayoutNode>(initialMainLayout);
  const [floating, setFloating] = useState<FloatingWindow[]>([]);
  const [dragInfo, setDragInfo] = useState<DragInfo>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [edgePreview, setEdgePreview] = useState<EdgePreview>(null);

  const mainPanelCount = countPanels(mainLayout);

  const detachPanel = (panelId: string) => {
    if (countPanels(mainLayout) <= 1) return;

    setMainLayout((prev) => removePanel(prev, panelId) ?? prev);

    setFloating((prev) => [
      ...prev,
      {
        id: `float-${panelId}-${Date.now()}`,
        title: panelId,
        x: 160 + prev.length * 40,
        y: 100 + prev.length * 40,
        width: 420,
        height: 280,
        maximized: false,
        layout: { type: "tabs", ids: [panelId], activeId: panelId },
      },
    ]);
  };

  const restorePanel = (panelId: string, windowId: string) => {
    setFloating((prev) =>
      prev
        .map((win) => ({
          ...win,
          layout: removePanel(win.layout, panelId),
        }))
        .filter((win) => win.layout !== null) as FloatingWindow[]
    );

    setMainLayout((prev) => ({
      type: "split",
      direction: "row",
      children: [prev, { type: "tabs", ids: [panelId], activeId: panelId }],
      sizes: [75, 25],
    }));
  };

  const dockFloatingWindow = (
    draggedWindowId: string,
    targetWindowId: string | "main",
    direction: EdgeDirection
  ) => {
    const dragged = floating.find((win) => win.id === draggedWindowId);
    if (!dragged) return;

    if (targetWindowId === "main") {
      setMainLayout((prev) =>
        wrapLayoutByEdge(prev, dragged.layout, direction)
      );

      setFloating((prev) => prev.filter((win) => win.id !== draggedWindowId));
    } else {
      setFloating((prev) =>
        prev
          .filter((win) => win.id !== draggedWindowId)
          .map((win) =>
            win.id === targetWindowId
              ? {
                  ...win,
                  layout: wrapLayoutByEdge(win.layout, dragged.layout, direction),
                }
              : win
          )
      );
    }

    setEdgePreview(null);
  };

  const dockPanelToEdge = (
    panelId: string,
    sourceWindowId: string | "main",
    targetWindowId: string | "main",
    direction: EdgeDirection
  ) => {
    if (sourceWindowId === "main" && mainPanelCount <= 1) return;

    const incoming: LayoutNode = {
      type: "tabs",
      ids: [panelId],
      activeId: panelId,
    };

    if (sourceWindowId === "main" && targetWindowId === "main") {
      setMainLayout((prev) => {
        const removed = removePanel(prev, panelId);
        if (!removed) return prev;

        return wrapLayoutByEdge(removed, incoming, direction);
      });

      setEdgePreview(null);
      setDragInfo(null);
      setDropPreview(null);
      return;
    }

    if (sourceWindowId !== "main" && targetWindowId === sourceWindowId) {
      setFloating((prev) =>
        prev.map((win) => {
          if (win.id !== sourceWindowId) return win;

          const removed = removePanel(win.layout, panelId);
          if (!removed) return win;

          return {
            ...win,
            layout: wrapLayoutByEdge(removed, incoming, direction),
          };
        })
      );

      setEdgePreview(null);
      setDragInfo(null);
      setDropPreview(null);
      return;
    }

    if (sourceWindowId === "main") {
      setMainLayout((prev) => removePanel(prev, panelId) ?? prev);
    } else {
      setFloating((prev) =>
        prev
          .map((win) =>
            win.id === sourceWindowId
              ? {
                  ...win,
                  layout: removePanel(win.layout, panelId),
                }
              : win
          )
          .filter((win) => win.layout !== null) as FloatingWindow[]
      );
    }

    if (targetWindowId === "main") {
      setMainLayout((prev) => wrapLayoutByEdge(prev, incoming, direction));
    } else {
      setFloating((prev) =>
        prev.map((win) =>
          win.id === targetWindowId
            ? {
                ...win,
                layout: wrapLayoutByEdge(win.layout, incoming, direction),
              }
            : win
        )
      );
    }

    setEdgePreview(null);
    setDragInfo(null);
    setDropPreview(null);
  };

  const removeDraggingPanelEverywhere = (panelId: string) => {
    setMainLayout((prev) => removePanel(prev, panelId) ?? prev);

    setFloating((prev) =>
      prev
        .map((win) => ({
          ...win,
          layout: removePanel(win.layout, panelId),
        }))
        .filter((win) => win.layout !== null) as FloatingWindow[]
    );
  };

  const handleDropOnPanel = (
    targetPanelId: string,
    targetWindowId: string | "main",
    e: React.DragEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragInfo) return;

    if (edgePreview) {
      dockPanelToEdge(
        dragInfo.panelId,
        dragInfo.sourceWindowId,
        edgePreview.targetWindowId,
        edgePreview.direction
      );
      return;
    }

    const movingPanel = dragInfo.panelId;

    if (movingPanel === targetPanelId) return;

    if (dragInfo.sourceWindowId === "main" && mainPanelCount <= 1) {
      setDragInfo(null);
      setDropPreview(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const direction = getDropDirection(rect, e.clientX, e.clientY);

    removeDraggingPanelEverywhere(movingPanel);

    if (targetWindowId === "main") {
      setMainLayout((prev) =>
        insertPanel(cloneNode(prev), targetPanelId, movingPanel, direction)
      );
    } else {
      setFloating((prev) =>
        prev.map((win) =>
          win.id === targetWindowId
            ? {
                ...win,
                layout: insertPanel(
                  cloneNode(win.layout),
                  targetPanelId,
                  movingPanel,
                  direction
                ),
              }
            : win
        )
      );
    }

    setDragInfo(null);
    setDropPreview(null);
  };

  const handleDragOverPanel = (targetPanelId: string, e: React.DragEvent) => {
    e.preventDefault();

    if (!dragInfo || dragInfo.panelId === targetPanelId) {
      setDropPreview(null);
      return;
    }

    if (edgePreview) {
      setDropPreview(null);
      return;
    }

    if (dragInfo.sourceWindowId === "main" && mainPanelCount <= 1) {
      setDropPreview(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const direction = getDropDirection(rect, e.clientX, e.clientY);

    setDropPreview({
      targetId: targetPanelId,
      direction,
    });
  };

  const handleWorkspaceDragOver = (e: React.DragEvent) => {
    if (!dragInfo) return;

    e.preventDefault();

    const preview = getTargetEdgePreview(e.clientX, e.clientY, null);

    setEdgePreview(preview);
  };

  const handleWorkspaceDrop = (e: React.DragEvent) => {
    if (!dragInfo) return;

    e.preventDefault();

    if (edgePreview) {
      dockPanelToEdge(
        dragInfo.panelId,
        dragInfo.sourceWindowId,
        edgePreview.targetWindowId,
        edgePreview.direction
      );
    }

    setEdgePreview(null);
    setDragInfo(null);
    setDropPreview(null);
  };

  const handleResizeSplit = (
    windowId: string | "main",
    path: number[],
    splitterIndex: number,
    deltaPercent: number,
    startSizes: number[]
  ) => {
    if (windowId === "main") {
      setMainLayout((prev) =>
        resizeSplitAtPath(prev, path, splitterIndex, deltaPercent, startSizes)
      );
    } else {
      setFloating((prev) =>
        prev.map((win) =>
          win.id === windowId
            ? {
                ...win,
                layout: resizeSplitAtPath(
                  win.layout,
                  path,
                  splitterIndex,
                  deltaPercent,
                  startSizes
                ),
              }
            : win
        )
      );
    }
  };

  return (
    <div className="app">
      <header className="menu-bar">
        <button>파일</button>
        <button>편집</button>
        <button>보기</button>
      </header>

      <main
        className="workspace"
        onDragOver={handleWorkspaceDragOver}
        onDrop={handleWorkspaceDrop}
      >
        <div className="main-dock" data-dock-id="main">
          <LayoutView
            node={mainLayout}
            windowId="main"
            path={[]}
            dragInfo={dragInfo}
            dropPreview={dropPreview}
            mainPanelCount={mainPanelCount}
            onDetach={detachPanel}
            onRestore={restorePanel}
            onDropPanel={handleDropOnPanel}
            onDragOverPanel={handleDragOverPanel}
            onDragStart={setDragInfo}
            onDragEnd={() => {
              setDragInfo(null);
              setDropPreview(null);
              setEdgePreview(null);
            }}
            onResizeSplit={handleResizeSplit}
            isFloating={false}
          />
        </div>

        {edgePreview && (
          <div className="edge-dock-preview" style={edgePreview.rect} />
        )}

        {floating.map((win) => (
          <FloatingView
            key={win.id}
            win={win}
            setFloating={setFloating}
            dragInfo={dragInfo}
            dropPreview={dropPreview}
            mainPanelCount={mainPanelCount}
            onEdgePreview={setEdgePreview}
            onDockFloatingWindow={dockFloatingWindow}
            onDetach={detachPanel}
            onRestore={restorePanel}
            onDropPanel={handleDropOnPanel}
            onDragOverPanel={handleDragOverPanel}
            onDragStart={setDragInfo}
            onDragEnd={() => {
              setDragInfo(null);
              setDropPreview(null);
              setEdgePreview(null);
            }}
            onResizeSplit={handleResizeSplit}
          />
        ))}
      </main>
    </div>
  );
}

function FloatingView({
  win,
  setFloating,
  dragInfo,
  dropPreview,
  mainPanelCount,
  onEdgePreview,
  onDockFloatingWindow,
  onDetach,
  onRestore,
  onDropPanel,
  onDragOverPanel,
  onDragStart,
  onDragEnd,
  onResizeSplit,
}: {
  win: FloatingWindow;
  setFloating: React.Dispatch<React.SetStateAction<FloatingWindow[]>>;
  dragInfo: DragInfo;
  dropPreview: DropPreview;
  mainPanelCount: number;
  onEdgePreview: (preview: EdgePreview) => void;
  onDockFloatingWindow: (
    draggedWindowId: string,
    targetWindowId: string | "main",
    direction: EdgeDirection
  ) => void;
  onDetach: (id: string) => void;
  onRestore: (id: string, windowId: string) => void;
  onDropPanel: (
    targetPanelId: string,
    targetWindowId: string | "main",
    e: React.DragEvent
  ) => void;
  onDragOverPanel: (targetPanelId: string, e: React.DragEvent) => void;
  onDragStart: (info: DragInfo) => void;
  onDragEnd: () => void;
  onResizeSplit: (
    windowId: string | "main",
    path: number[],
    splitterIndex: number,
    deltaPercent: number,
    startSizes: number[]
  ) => void;
}) {
  const moveWindow = (e: React.MouseEvent) => {
    if (win.maximized) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const originX = win.x;
    const originY = win.y;

    let currentPreview: EdgePreview = null;

    const onMove = (ev: MouseEvent) => {
      const nextX = originX + ev.clientX - startX;
      const nextY = originY + ev.clientY - startY;

      const preview = getTargetEdgePreview(ev.clientX, ev.clientY, win.id);

      currentPreview = preview;
      onEdgePreview(preview);

      setFloating((prev) =>
        prev.map((w) =>
          w.id === win.id
            ? {
                ...w,
                x: nextX,
                y: nextY,
              }
            : w
        )
      );
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      if (currentPreview) {
        onDockFloatingWindow(
          win.id,
          currentPreview.targetWindowId,
          currentPreview.direction
        );
      } else {
        onEdgePreview(null);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resizeWindow = (
    e: React.MouseEvent,
    mode: "right" | "bottom" | "corner"
  ) => {
    e.stopPropagation();
    e.preventDefault();

    if (win.maximized) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = win.width;
    const startH = win.height;

    const onMove = (ev: MouseEvent) => {
      const nextWidth =
        mode === "right" || mode === "corner"
          ? Math.max(260, startW + ev.clientX - startX)
          : startW;

      const nextHeight =
        mode === "bottom" || mode === "corner"
          ? Math.max(180, startH + ev.clientY - startY)
          : startH;

      setFloating((prev) =>
        prev.map((w) =>
          w.id === win.id
            ? {
                ...w,
                width: nextWidth,
                height: nextHeight,
              }
            : w
        )
      );
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`floating-window ${win.maximized ? "maximized" : ""}`}
      data-dock-id={win.id}
      style={
        win.maximized
          ? {}
          : {
              left: win.x,
              top: win.y,
              width: win.width,
              height: win.height,
            }
      }
    >
      <div className="floating-titlebar" onMouseDown={moveWindow}>
        <span>{win.title}</span>

        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() =>
            setFloating((prev) =>
              prev.map((w) =>
                w.id === win.id ? { ...w, maximized: !w.maximized } : w
              )
            )
          }
        >
          {win.maximized ? "🗗" : "🗖"}
        </button>
      </div>

      <div className="floating-content">
        <LayoutView
          node={win.layout}
          windowId={win.id}
          path={[]}
          dragInfo={dragInfo}
          dropPreview={dropPreview}
          mainPanelCount={mainPanelCount}
          onDetach={onDetach}
          onRestore={onRestore}
          onDropPanel={onDropPanel}
          onDragOverPanel={onDragOverPanel}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onResizeSplit={onResizeSplit}
          isFloating={true}
        />
      </div>

      {!win.maximized && (
        <>
          <div
            className="resize-handle resize-right"
            onMouseDown={(e) => resizeWindow(e, "right")}
          />
          <div
            className="resize-handle resize-bottom"
            onMouseDown={(e) => resizeWindow(e, "bottom")}
          />
          <div
            className="resize-handle resize-corner"
            onMouseDown={(e) => resizeWindow(e, "corner")}
          />
        </>
      )}
    </div>
  );
}

function LayoutView({
  node,
  windowId,
  path,
  dragInfo,
  dropPreview,
  mainPanelCount,
  onDetach,
  onRestore,
  onDropPanel,
  onDragOverPanel,
  onDragStart,
  onDragEnd,
  onResizeSplit,
  isFloating,
}: {
  node: LayoutNode;
  windowId: string | "main";
  path: number[];
  dragInfo: DragInfo;
  dropPreview: DropPreview;
  mainPanelCount: number;
  onDetach: (id: string) => void;
  onRestore: (id: string, windowId: string) => void;
  onDropPanel: (
    targetPanelId: string,
    targetWindowId: string | "main",
    e: React.DragEvent
  ) => void;
  onDragOverPanel: (targetPanelId: string, e: React.DragEvent) => void;
  onDragStart: (info: DragInfo) => void;
  onDragEnd: () => void;
  onResizeSplit: (
    windowId: string | "main",
    path: number[],
    splitterIndex: number,
    deltaPercent: number,
    startSizes: number[]
  ) => void;
  isFloating: boolean;
}) {
  if (node.type === "split") {
    const sizes =
      node.sizes ?? Array(node.children.length).fill(100 / node.children.length);

    const startResize = (e: React.MouseEvent, splitterIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const parent = e.currentTarget.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();

      const startX = e.clientX;
      const startY = e.clientY;

      const count = node.children.length;
      const startSizes = node.sizes ?? Array(count).fill(100 / count);

      const onMove = (ev: MouseEvent) => {
        const deltaPx =
          node.direction === "row"
            ? ev.clientX - startX
            : ev.clientY - startY;

        const totalPx = node.direction === "row" ? rect.width : rect.height;
        const deltaPercent = (deltaPx / totalPx) * 100;

        onResizeSplit(
          windowId,
          path,
          splitterIndex,
          deltaPercent,
          startSizes
        );
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    return (
      <div className={`split ${node.direction}`}>
        {node.children.map((child, index) => (
          <React.Fragment key={index}>
            <div
              className="split-child"
              style={{
                flexBasis: `${sizes[index]}%`,
                flexGrow: 0,
                flexShrink: 0,
              }}
            >
              <LayoutView
                node={child}
                windowId={windowId}
                path={[...path, index]}
                dragInfo={dragInfo}
                dropPreview={dropPreview}
                mainPanelCount={mainPanelCount}
                onDetach={onDetach}
                onRestore={onRestore}
                onDropPanel={onDropPanel}
                onDragOverPanel={onDragOverPanel}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onResizeSplit={onResizeSplit}
                isFloating={isFloating}
              />
            </div>

            {index < node.children.length - 1 && (
              <div
                className={`splitter ${
                  node.direction === "row"
                    ? "splitter-vertical"
                    : "splitter-horizontal"
                }`}
                onMouseDown={(e) => startResize(e, index)}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const activeId = node.activeId || node.ids[0];
  const canDrag = isFloating || windowId !== "main" || mainPanelCount > 1;

  return (
    <div className="panel-frame">
      <div className="tab-bar">
        {node.ids.map((id) => (
          <div
            key={id}
            className={`tab ${id === activeId ? "active" : ""}`}
            draggable={canDrag}
            onDragStart={(e) => {
              if (!canDrag) {
                e.preventDefault();
                return;
              }

              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);

              onDragStart({
                panelId: id,
                sourceWindowId: windowId,
              });
            }}
            onDragEnd={onDragEnd}
          >
            {id}
          </div>
        ))}
      </div>

      <div
        className="panel-area"
        onDragOver={(e) => onDragOverPanel(activeId, e)}
        onDrop={(e) => onDropPanel(activeId, windowId, e)}
      >
        {dragInfo &&
          dragInfo.panelId !== activeId &&
          dropPreview?.targetId === activeId && (
            <div className={`drop-preview ${dropPreview.direction}`} />
          )}

        <div className="panel-toolbar">
          {!isFloating && mainPanelCount > 1 && (
            <button onClick={() => onDetach(activeId)}>분리</button>
          )}

          {isFloating && (
            <button onClick={() => onRestore(activeId, windowId)}>
              되돌리기
            </button>
          )}
        </div>

        <div className="panel-content">{activeId}</div>
      </div>
    </div>
  );
}

export default App;