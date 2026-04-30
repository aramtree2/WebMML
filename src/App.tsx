import DockLayout from "rc-dock";
import "rc-dock/dist/rc-dock.css";
import "./App.css";

const panel = (title: string) => ({
  id: title,
  title,
  closable: true,
  minWidth: 180,
  minHeight: 120,
  content: <div className="panel-body">{title}</div>,
});

const defaultLayout = {
  dockbox: {
    mode: "horizontal",
    children: [
      {
        size: 18,
        tabs: [panel("팔레트")],
      },
      {
        size: 55,
        mode: "vertical",
        children: [
          {
            size: 65,
            mode: "horizontal",
            children: [
              { size: 60, tabs: [panel("피아노 롤")] },
              { size: 40, tabs: [panel("악보")] },
            ],
          },
          {
            size: 35,
            tabs: [panel("가상 피아노")],
          },
        ],
      },
      {
        size: 20,
        mode: "vertical",
        children: [
          { size: 35, tabs: [panel("악기 구성")] },
          { size: 30, tabs: [panel("mml 코드 표")] },
          { size: 35, tabs: [panel("재생 패널")] },
        ],
      },
    ],
  },
  floatbox: {
    mode: "float",
    children: [],
  },
};

function App() {
  return (
    <div className="app">
      <header className="menu-bar">
        <button className="menu-button">파일</button>
        <button className="menu-button">편집</button>
        <button className="menu-button">보기</button>
      </header>

      <main className="dock-wrapper">
        <DockLayout
          defaultLayout={defaultLayout as any}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          }}
        />
      </main>
    </div>
  );
}

export default App;