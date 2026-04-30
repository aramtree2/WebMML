import { Rnd } from "react-rnd";
import { useEffect, useRef, useState } from "react";
import "./App.css";

type Panel = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

const initialPanels: Panel[] = [
  { id: "palette", title: "팔레트", x: 0.005, y: 0.005, width: 0.16, height: 0.985, visible: true },
  { id: "piano", title: "피아노 롤", x: 0.175, y: 0.005, width: 0.425, height: 0.64, visible: true },
  { id: "score", title: "악보", x: 0.61, y: 0.005, width: 0.205, height: 0.64, visible: true },
  { id: "instrument", title: "악기 구성", x: 0.825, y: 0.005, width: 0.17, height: 0.355, visible: true },
  { id: "mml", title: "mml 코드 표", x: 0.825, y: 0.375, width: 0.17, height: 0.27, visible: true },
  { id: "play", title: "재생 패널", x: 0.825, y: 0.66, width: 0.17, height: 0.33, visible: true },
  { id: "virtual", title: "가상 피아노", x: 0.175, y: 0.665, width: 0.64, height: 0.325, visible: true },
];

function App() {
  const workspaceRef = useRef<HTMLElement | null>(null);

  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 1000, height: 600 });
  const [zMap, setZMap] = useState<Record<string, number>>({});
  const [topZ, setTopZ] = useState(1);

  useEffect(() => {
    const updateSize = () => {
      if (!workspaceRef.current) return;

      setWorkspaceSize({
        width: workspaceRef.current.clientWidth,
        height: workspaceRef.current.clientHeight,
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const bringToFront = (id: string) => {
    setTopZ((prev) => {
      const next = prev + 1;
      setZMap((old) => ({ ...old, [id]: next }));
      return next;
    });
  };

  const closePanel = (id: string) => {
    setPanels((prev) =>
      prev.map((panel) =>
        panel.id === id ? { ...panel, visible: false } : panel
      )
    );
  };

  const updatePanelPosition = (id: string, x: number, y: number) => {
    setPanels((prev) =>
      prev.map((panel) =>
        panel.id === id
          ? {
              ...panel,
              x: x / workspaceSize.width,
              y: y / workspaceSize.height,
            }
          : panel
      )
    );
  };

  const updatePanelSize = (
    id: string,
    width: number,
    height: number,
    x: number,
    y: number
  ) => {
    setPanels((prev) =>
      prev.map((panel) =>
        panel.id === id
          ? {
              ...panel,
              width: width / workspaceSize.width,
              height: height / workspaceSize.height,
              x: x / workspaceSize.width,
              y: y / workspaceSize.height,
            }
          : panel
      )
    );
  };

  return (
    <div className="app">
      <header className="menu-bar">
        <button className="menu-button">파일</button>
        <button className="menu-button">편집</button>
        <button className="menu-button">보기</button>
      </header>

      <main className="workspace" ref={workspaceRef}>
        {panels
          .filter((panel) => panel.visible)
          .map((panel) => {
            const x = panel.x * workspaceSize.width;
            const y = panel.y * workspaceSize.height;
            const width = panel.width * workspaceSize.width;
            const height = panel.height * workspaceSize.height;

            return (
              <Rnd
                key={panel.id}
                position={{ x, y }}
                size={{ width, height }}
                bounds="parent"
                minWidth={130}
                minHeight={90}
                dragHandleClassName="panel-header"
                style={{ zIndex: zMap[panel.id] || 1 }}
                onMouseDownCapture={() => bringToFront(panel.id)}
                onDragStart={() => bringToFront(panel.id)}
                onResizeStart={() => bringToFront(panel.id)}
                onDragStop={(_, data) =>
                  updatePanelPosition(panel.id, data.x, data.y)
                }
                onResizeStop={(_, __, ref, ___, position) =>
                  updatePanelSize(
                    panel.id,
                    ref.offsetWidth,
                    ref.offsetHeight,
                    position.x,
                    position.y
                  )
                }
              >
                <section className="panel">
                  <div className="panel-header">
                    <span className="panel-title">{panel.title}</span>
                    <button
                      className="close-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        closePanel(panel.id);
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div className="panel-body">
                    <span>{panel.title}</span>
                  </div>
                </section>
              </Rnd>
            );
          })}
      </main>
    </div>
  );
}

export default App;