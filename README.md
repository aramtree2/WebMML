# Web MML Editor - 소스 구조 설명

이 문서는 현재 `src/` 폴더의 역할 분리를 설명한다.  
현재 구조의 핵심 목표는 `App.tsx`에 모든 UI/로직을 몰아넣지 않고, 저장, 레이아웃 데이터, UI 컴포넌트, 도킹 로직, 유틸 함수를 각각 분리하는 것이다.

---

## 전체 구조

```txt
src/
  App.tsx
  main.tsx
  App.css
  index.css

  storage/
    layoutStorage.ts

  layouts/
    defaultLayout.ts

  types/
    layout.ts

  components/
    editor/
      EditorShell.tsx
      MenuBar.tsx
      Workspace.tsx
      LayoutView.tsx
      PanelFrame.tsx
      FloatingWindowView.tsx

    panels/
      panelRegistry.tsx

  hooks/
    useDockingLayout.ts

  utils/
    layoutTree.ts
    dropPosition.ts
```

---

## 실행 흐름 요약

```txt
main.tsx
→ App.tsx 실행
→ localStorage에 저장된 UI 레이아웃 검사
→ 있으면 저장된 레이아웃 사용
→ 없으면 기본 레이아웃 생성
→ useDockingLayout로 도킹/이동/분리 로직 연결
→ EditorShell 렌더링
→ Workspace 안에서 LayoutView와 FloatingWindowView 렌더링
```

`App.tsx`는 앱의 시작점 역할만 하고, 실제 UI 조작 로직은 `useDockingLayout.ts`가 담당한다.

---

# 루트 파일

## `src/main.tsx`

React 앱을 브라우저 DOM에 연결하는 진입점이다.

역할:

- `ReactDOM.createRoot()` 실행
- `<App />` 렌더링
- 전역 CSS인 `index.css` 로드

---

## `src/App.tsx`

앱 최상위 컴포넌트다.

역할:

- 브라우저 localStorage에서 저장된 UI 레이아웃을 불러온다.
- 저장된 레이아웃이 없으면 기본 레이아웃을 생성한다.
- `useDockingLayout()`에 초기 레이아웃을 전달한다.
- 레이아웃이 바뀔 때마다 localStorage에 저장한다.
- 최종적으로 `<EditorShell />`을 렌더링한다.

핵심 흐름:

```ts
const initialLayoutState = loadLayoutState() ?? createDefaultLayoutState();
const docking = useDockingLayout(initialLayoutState);
saveLayoutState({ mainLayout: docking.mainLayout, floating: docking.floating });
```

즉, `App.tsx`는 UI를 직접 구현하지 않고, 저장/초기화/연결만 담당한다.

---

## `src/App.css`

에디터 UI 전체 스타일 파일이다.

포함 내용:

- 앱 전체 레이아웃
- 메뉴바
- 작업 영역
- split 레이아웃
- splitter
- 패널 프레임
- 탭 바
- 드롭 미리보기
- 플로팅 창
- 리사이즈 핸들

---

## `src/index.css`

앱 전역 스타일 파일이다.

포함 내용:

- `:root` 전역 색상 변수
- 기본 폰트 설정
- 라이트/다크 모드 변수
- `body`, `#root`, `h1`, `h2`, `p`, `code` 기본 스타일

에디터 레이아웃 전용 스타일은 `App.css`, 앱 전체 기본 스타일은 `index.css`로 보면 된다.

---

# `storage/`

브라우저 로컬 저장소와 관련된 파일을 모아두는 폴더다.

## `storage/layoutStorage.ts`

UI 레이아웃 저장/불러오기를 담당한다.

현재는 `localStorage`를 사용한다.

### 상수

#### `STORAGE_KEY`

```ts
const STORAGE_KEY = "web-mml.editor-layout.v1";
```

localStorage에 저장할 때 사용하는 키 값이다.  
뒤의 `v1`은 저장 데이터 구조 버전을 의미한다.

나중에 저장 구조가 바뀌면 `v2`, `v3`처럼 키를 바꿔서 이전 데이터와 충돌을 피할 수 있다.

### 함수

#### `loadLayoutState()`

```ts
export function loadLayoutState(): EditorLayoutState | null
```

localStorage에서 저장된 UI 레이아웃을 불러온다.

동작:

- 저장된 값이 없으면 `null` 반환
- JSON 파싱에 실패하면 `null` 반환
- 정상적으로 읽으면 `EditorLayoutState` 반환

사용 위치:

- `App.tsx`

---

#### `saveLayoutState(state)`

```ts
export function saveLayoutState(state: EditorLayoutState): void
```

현재 UI 레이아웃 상태를 localStorage에 저장한다.

저장 대상:

- `mainLayout`
- `floating`

사용 위치:

- `App.tsx`의 `useEffect`

---

#### `clearLayoutState()`

```ts
export function clearLayoutState(): void
```

localStorage에 저장된 UI 레이아웃을 삭제한다.

사용 예:

- UI 배치 초기화 버튼
- 디버깅
- 저장 데이터 구조 변경 후 초기화

---

# `layouts/`

기본 레이아웃 데이터를 정의하는 폴더다.

## `layouts/defaultLayout.ts`

앱을 처음 실행했을 때 사용할 기본 UI 배치를 정의한다.

### 값

#### `initialMainLayout`

```ts
export const initialMainLayout: LayoutNode
```

기본 메인 도킹 영역의 레이아웃 트리다.

예를 들어 다음과 같은 구조를 표현한다.

```txt
메인 도킹 영역
├─ 팔레트
├─ 중앙 영역
│  ├─ 피아노 롤
│  ├─ 악보
│  └─ 가상 피아노
└─ 오른쪽 영역
   ├─ 악기 구성
   ├─ MML 코드 표
   └─ 재생 패널
```

실제 화면 배치는 `split`과 `tabs` 노드로 표현된다.

---

### 함수

#### `createDefaultLayoutState()`

```ts
export function createDefaultLayoutState(): EditorLayoutState
```

기본 UI 상태 전체를 생성한다.

반환 내용:

```ts
{
  mainLayout: initialMainLayout,
  floating: []
}
```

즉, 처음 실행 시에는 플로팅 창 없이 모든 패널이 메인 영역에 붙어 있는 상태로 시작한다.

---

# `types/`

프로젝트 공통 타입을 정의하는 폴더다.

## `types/layout.ts`

도킹 레이아웃 시스템에서 사용하는 타입들이 정의되어 있다.

---

## 타입 설명

### `Direction`

```ts
export type Direction = "left" | "right" | "top" | "bottom" | "center";
```

패널을 다른 패널에 드롭할 때 어느 위치에 넣을지 나타낸다.

값 의미:

| 값 | 의미 |
|---|---|
| `left` | 대상 패널의 왼쪽에 배치 |
| `right` | 대상 패널의 오른쪽에 배치 |
| `top` | 대상 패널의 위쪽에 배치 |
| `bottom` | 대상 패널의 아래쪽에 배치 |
| `center` | 대상 패널의 탭 그룹에 합치기 |

---

### `EdgeDirection`

```ts
export type EdgeDirection = "left" | "right" | "top" | "bottom";
```

화면 또는 플로팅 창의 가장자리에 도킹할 때 사용하는 방향이다.

`Direction`과 다르게 `center`가 없다.

---

### `LayoutNode`

```ts
export type LayoutNode =
  | { type: "tabs"; ids: string[]; activeId: string }
  | {
      type: "split";
      direction: "row" | "column";
      children: LayoutNode[];
      sizes?: number[];
    };
```

UI 배치를 트리 구조로 표현하는 핵심 타입이다.

#### `tabs` 노드

여러 패널이 하나의 탭 그룹으로 묶여 있는 상태다.

```ts
{
  type: "tabs",
  ids: ["피아노 롤", "악보"],
  activeId: "피아노 롤"
}
```

의미:

- `ids`: 이 탭 그룹에 들어있는 패널 ID 목록
- `activeId`: 현재 선택된 탭의 패널 ID

#### `split` 노드

화면을 가로 또는 세로로 나누는 노드다.

```ts
{
  type: "split",
  direction: "row",
  children: [...],
  sizes: [25, 75]
}
```

의미:

- `direction: "row"`: 좌우 분할
- `direction: "column"`: 상하 분할
- `children`: 분할된 자식 레이아웃들
- `sizes`: 각 자식이 차지하는 비율

---

### `FloatingWindow`

```ts
export type FloatingWindow = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  layout: LayoutNode;
};
```

메인 도킹 영역에서 분리된 독립 창을 나타낸다.

필드 의미:

| 필드 | 의미 |
|---|---|
| `id` | 플로팅 창 고유 ID |
| `x` | 창의 x 위치 |
| `y` | 창의 y 위치 |
| `width` | 창 너비 |
| `height` | 창 높이 |
| `maximized` | 최대화 여부 |
| `layout` | 창 내부에 들어있는 레이아웃 트리 |

---

### `DragInfo`

```ts
export type DragInfo = {
  panelId: string;
  sourceWindowId: string | "main";
} | null;
```

현재 드래그 중인 패널 정보를 나타낸다.

필드 의미:

- `panelId`: 드래그 중인 패널 ID
- `sourceWindowId`: 드래그가 시작된 위치
  - `"main"`: 메인 도킹 영역
  - 그 외 문자열: 플로팅 창 ID
- `null`: 현재 드래그 중인 패널 없음

---

### `DropPreview`

```ts
export type DropPreview = {
  targetId: string;
  direction: Direction;
} | null;
```

패널 위에 드래그했을 때 표시되는 드롭 미리보기 정보다.

필드 의미:

- `targetId`: 드롭 대상 패널 ID
- `direction`: 대상 패널의 어느 영역에 드롭될지
- `null`: 미리보기 없음

---

### `EdgePreview`

```ts
export type EdgePreview = {
  targetWindowId: string | "main";
  direction: EdgeDirection;
  rect: React.CSSProperties;
} | null;
```

화면 또는 창의 가장자리에 도킹할 때 표시되는 미리보기 정보다.

필드 의미:

- `targetWindowId`: 도킹 대상
- `direction`: 도킹 방향
- `rect`: 미리보기 박스의 CSS 위치/크기
- `null`: 미리보기 없음

---

### `EditorLayoutState`

```ts
export type EditorLayoutState = {
  mainLayout: LayoutNode;
  floating: FloatingWindow[];
};
```

에디터 UI 배치 전체 상태다.

필드 의미:

- `mainLayout`: 메인 도킹 영역의 레이아웃
- `floating`: 분리된 플로팅 창 목록

localStorage 저장 단위도 이 타입을 기준으로 한다.

---

# `components/editor/`

에디터의 공통 UI 껍데기와 도킹 시스템 화면을 담당하는 컴포넌트 폴더다.

중요한 점은 이 폴더는 피아노 롤, 악보, MML 편집기 같은 실제 기능을 구현하는 곳이 아니라는 것이다.  
여기는 패널을 배치하고, 이동하고, 분리하고, 보여주는 에디터 프레임워크 영역이다.

---

## `components/editor/EditorShell.tsx`

에디터 화면 전체의 껍데기 컴포넌트다.

역할:

- 전체 앱 div 생성
- `MenuBar` 렌더링
- `Workspace` 렌더링
- `docking` 컨트롤러를 하위 컴포넌트에 전달

구조:

```tsx
<div className="app">
  <MenuBar />
  <Workspace docking={docking} />
</div>
```

---

## `components/editor/MenuBar.tsx`

상단 메뉴바 컴포넌트다.

역할:

- 파일
- 편집
- 보기

현재는 UI 버튼만 있고, 실제 기능 연결은 이후 구현하면 된다.

나중에 추가 가능 기능:

- 새 프로젝트
- 프로젝트 열기
- 저장
- UI 초기화
- 내보내기
- 실행/재생 관련 메뉴

---

## `components/editor/Workspace.tsx`

에디터의 실제 작업 영역 컴포넌트다.

역할:

- 메인 도킹 영역 렌더링
- 플로팅 창 목록 렌더링
- edge dock preview 렌더링
- `LayoutView`와 `FloatingWindowView`에 이벤트 핸들러 전달

구조:

```txt
workspace
├─ main-dock
│  └─ LayoutView
├─ edge-dock-preview
└─ FloatingWindowView[]
```

`Workspace`는 화면 배치의 가장 바깥 컨테이너다.

---

## `components/editor/LayoutView.tsx`

`LayoutNode` 트리를 실제 UI로 변환하는 재귀 컴포넌트다.

역할:

- `split` 노드면 화면을 나누어 자식 `LayoutView`를 렌더링한다.
- `tabs` 노드면 `PanelFrame`을 렌더링한다.
- splitter 드래그 이벤트를 처리해 크기 조절을 요청한다.

중요 개념:

```txt
LayoutNode 데이터
→ LayoutView 재귀 렌더링
→ 실제 화면 UI
```

예:

```txt
split(row)
├─ tabs(팔레트)
└─ split(column)
   ├─ tabs(피아노 롤)
   └─ tabs(가상 피아노)
```

이런 트리를 실제 flex UI로 바꾼다.

---

## `components/editor/PanelFrame.tsx`

패널 하나의 외곽 UI를 담당한다.

역할:

- 탭 바 렌더링
- active tab 표시
- 탭 드래그 시작/종료 이벤트 연결
- 드롭 위치 preview 표시
- 분리 버튼 표시
- 실제 패널 내용 렌더링

내부에서 `renderPanel(activeId)`를 호출해 실제 패널 내용을 가져온다.

구조:

```txt
panel-frame
├─ tab-bar
│  ├─ tab
│  └─ tab
└─ panel-area
   ├─ toolbar
   ├─ drop-preview
   └─ panel-content
```

---

## `components/editor/FloatingWindowView.tsx`

분리된 창 하나를 렌더링하는 컴포넌트다.

역할:

- 플로팅 창 위치/크기 표시
- 제목바 드래그로 창 이동
- 리사이즈 핸들로 크기 변경
- 최대화/복원 버튼 처리
- 창 내부에 `LayoutView` 렌더링
- 창을 가장자리에 끌고 갔을 때 도킹 처리

즉, 메인 영역에서 분리된 독립 창을 담당한다.

---

# `components/panels/`

실제 기능 패널을 구현하는 폴더다.

현재는 placeholder 방식으로 되어 있지만, 나중에는 패널마다 폴더를 만들어 확장하면 된다.

예상 구조:

```txt
components/panels/
  PianoRoll/
    PianoRollPanel.tsx
    PianoRollCanvas.tsx
    usePianoRoll.ts

  Score/
    ScorePanel.tsx
    ScoreRenderer.tsx

  VirtualPiano/
    VirtualPianoPanel.tsx

  MmlCode/
    MmlCodePanel.tsx

  Playback/
    PlaybackPanel.tsx
```

---

## `components/panels/panelRegistry.tsx`

패널 ID와 실제 패널 컴포넌트를 연결하는 파일이다.

현재 역할:

- 패널 이름 목록 관리
- 아직 구현되지 않은 패널은 `PlaceholderPanel`로 표시
- `renderPanel(panelId)` 함수 제공

### 값

#### `panelNames`

현재 존재하는 패널 이름 목록이다.

예:

```ts
const panelNames = [
  "팔레트",
  "피아노 롤",
  "악보",
  "가상 피아노",
  "악기 구성",
  "MML 코드 표",
  "재생 패널",
];
```

이 이름들은 `LayoutNode`의 `ids`와 연결된다.

---

### 함수

#### `PlaceholderPanel({ name })`

아직 실제 구현이 없는 패널을 임시로 보여주는 컴포넌트다.

---

#### `renderPanel(panelId)`

```ts
export function renderPanel(panelId: string)
```

패널 ID를 받아 실제 렌더링할 React 요소를 반환한다.

현재는 대부분 placeholder를 반환한다.

나중에는 다음처럼 실제 패널 컴포넌트를 연결하면 된다.

```tsx
const panelRegistry = {
  "피아노 롤": PianoRollPanel,
  "악보": ScorePanel,
  "가상 피아노": VirtualPianoPanel,
};
```

---

# `hooks/`

React 상태와 이벤트 기반 로직을 모아두는 폴더다.

## `hooks/useDockingLayout.ts`

도킹 레이아웃 시스템의 핵심 로직을 담당하는 커스텀 훅이다.

이 파일은 현재 UI의 움직임, 패널 분리, 탭 이동, 도킹, 리사이즈 같은 상태 변경을 관리한다.

역할:

- `mainLayout` 상태 관리
- `floating` 상태 관리
- `dragInfo` 상태 관리
- `dropPreview` 상태 관리
- `edgePreview` 상태 관리
- 패널 선택 처리
- 패널 분리 처리
- 플로팅 창 복귀 처리
- 패널 드래그 앤 드롭 처리
- edge docking 처리
- split resize 처리

---

## `useDockingLayout(initialState)`

```ts
export function useDockingLayout(initialState: EditorLayoutState)
```

초기 레이아웃 상태를 받아서 도킹 시스템 전체를 제어하는 컨트롤러 객체를 반환한다.

반환되는 주요 상태:

| 값 | 의미 |
|---|---|
| `mainLayout` | 메인 도킹 영역 레이아웃 |
| `floating` | 플로팅 창 목록 |
| `dragInfo` | 현재 드래그 중인 패널 정보 |
| `dropPreview` | 패널 내부 드롭 미리보기 |
| `edgePreview` | 가장자리 도킹 미리보기 |
| `mainPanelCount` | 메인 영역에 남아있는 패널 수 |

반환되는 주요 함수:

| 함수 | 역할 |
|---|---|
| `setFloating` | 플로팅 창 상태 직접 변경 |
| `setEdgePreview` | edge preview 변경 |
| `handleSelectTab` | 탭 선택 처리 |
| `detachPanel` | 패널을 플로팅 창으로 분리 |
| `restorePanel` | 플로팅 창의 패널을 메인 영역으로 복귀 |
| `handleDragStart` | 탭 드래그 시작 처리 |
| `handleDragEnd` | 탭 드래그 종료 처리 |
| `handleDragOverPanel` | 패널 위 드래그 중 preview 계산 |
| `handleDropPanel` | 패널 드롭 처리 |
| `dockFloatingWindow` | 플로팅 창을 대상 영역에 도킹 |
| `resizeSplit` | split 영역 크기 조절 |

---

## `DockingLayoutController`

```ts
export type DockingLayoutController = ReturnType<typeof useDockingLayout>;
```

`useDockingLayout()`이 반환하는 컨트롤러 객체 타입이다.

컴포넌트에서 `docking` prop 타입으로 사용한다.

예:

```ts
type EditorShellProps = {
  docking: DockingLayoutController;
};
```

---

# `utils/`

React 상태와 직접 연결되지 않는 순수 함수들을 모아두는 폴더다.

---

## `utils/layoutTree.ts`

`LayoutNode` 트리를 조작하는 순수 함수들이 들어 있다.

이 파일의 함수들은 대부분 다음 특징을 가진다.

- 입력으로 `LayoutNode`를 받는다.
- 기존 객체를 직접 수정하지 않는다.
- 변경된 새 `LayoutNode`를 반환한다.
- React state 바깥에서도 테스트할 수 있다.

---

### `cloneNode(node)`

```ts
export function cloneNode(node: LayoutNode): LayoutNode
```

레이아웃 노드를 깊은 복사한다.

현재는 `structuredClone()`을 사용한다.

---

### `countPanels(node)`

```ts
export function countPanels(node: LayoutNode): number
```

레이아웃 트리 안에 들어있는 패널 수를 센다.

사용 예:

- 메인 영역에 패널이 1개만 남았을 때 더 이상 분리하지 못하게 막기

---

### `containsPanel(node, id)`

```ts
export function containsPanel(node: LayoutNode, id: string): boolean
```

특정 패널 ID가 레이아웃 트리 안에 있는지 확인한다.

사용 예:

- 어떤 split 자식 안에 대상 패널이 있는지 찾기
- 재귀적으로 특정 패널이 들어있는 경로 찾기

---

### `setActivePanel(node, panelId)`

```ts
export function setActivePanel(node: LayoutNode, panelId: string): LayoutNode
```

특정 패널이 들어있는 탭 그룹의 `activeId`를 변경한다.

사용 예:

- 탭 클릭 시 active tab 변경

---

### `removePanel(node, panelId)`

```ts
export function removePanel(node: LayoutNode, panelId: string): LayoutNode | null
```

레이아웃 트리에서 특정 패널을 제거한다.

동작:

- `tabs` 노드에서 패널 ID 제거
- 탭이 하나도 안 남으면 `null` 반환
- `split`의 자식이 하나만 남으면 split을 제거하고 자식만 반환
- `sizes` 비율을 다시 정규화

사용 예:

- 패널을 플로팅 창으로 분리할 때
- 패널을 다른 위치로 드래그 이동할 때

---

### `insertPanel(node, targetId, panelId, direction)`

```ts
export function insertPanel(
  node: LayoutNode,
  targetId: string,
  panelId: string,
  direction: Direction
): LayoutNode
```

특정 패널을 대상 패널 주변에 삽입한다.

동작:

- `center`: 대상 탭 그룹에 패널을 추가
- `left`: 대상 패널 왼쪽에 새 split 생성
- `right`: 대상 패널 오른쪽에 새 split 생성
- `top`: 대상 패널 위쪽에 새 split 생성
- `bottom`: 대상 패널 아래쪽에 새 split 생성

---

### `splitPanelBySelf(node, panelId, direction)`

```ts
export function splitPanelBySelf(
  node: LayoutNode,
  panelId: string,
  direction: Direction
): LayoutNode
```

같은 탭 그룹 안의 패널을 자기 자신 기준으로 분리할 때 사용한다.

예:

```txt
[피아노 롤, 악보]
```

여기서 `악보` 탭을 오른쪽으로 분리하면:

```txt
split row
├─ [피아노 롤]
└─ [악보]
```

---

### `wrapLayoutByEdge(base, incoming, direction)`

```ts
export function wrapLayoutByEdge(
  base: LayoutNode,
  incoming: LayoutNode,
  direction: EdgeDirection
): LayoutNode
```

기존 레이아웃의 가장자리에 다른 레이아웃을 붙인다.

사용 예:

- 플로팅 창을 메인 화면 오른쪽에 도킹
- 플로팅 창을 다른 플로팅 창 위쪽에 도킹

예:

```txt
right 방향 도킹

split row
├─ base 75%
└─ incoming 25%
```

---

### `resizeSplitAtPath(node, path, splitterIndex, deltaPercent, startSizes)`

```ts
export function resizeSplitAtPath(
  node: LayoutNode,
  path: number[],
  splitterIndex: number,
  deltaPercent: number,
  startSizes: number[]
): LayoutNode
```

특정 split 노드의 splitter를 움직여 크기 비율을 변경한다.

매개변수 의미:

| 매개변수 | 의미 |
|---|---|
| `node` | 전체 레이아웃 트리 |
| `path` | 수정할 split 노드까지의 경로 |
| `splitterIndex` | 몇 번째 splitter를 움직이는지 |
| `deltaPercent` | 이동량을 퍼센트로 변환한 값 |
| `startSizes` | 드래그 시작 시점의 크기 비율 |

`path` 예:

```txt
path = [1, 0]
```

의미:

```txt
root.children[1].children[0]
```

최소 크기 제한도 포함되어 있어 패널이 너무 작아지는 것을 막는다.

---

## `utils/dropPosition.ts`

마우스 위치를 기반으로 드롭 위치를 계산하는 함수들이 들어 있다.

---

### `getDropDirection(rect, x, y)`

```ts
export function getDropDirection(rect: DOMRect, x: number, y: number): Direction
```

마우스가 패널의 어느 위치에 있는지 계산한다.

판정 기준:

| 영역 | 결과 |
|---|---|
| 왼쪽 28% | `left` |
| 오른쪽 28% | `right` |
| 위쪽 28% | `top` |
| 아래쪽 28% | `bottom` |
| 중앙 | `center` |

사용 예:

- 패널 드래그 중 파란색 drop preview 표시
- 드롭 시 어느 방향에 삽입할지 결정

---

### `getTargetEdgePreview(clientX, clientY, sourceWindowId)`

```ts
export function getTargetEdgePreview(
  clientX: number,
  clientY: number,
  sourceWindowId: string | "main" | null
): EdgePreview
```

마우스가 workspace 또는 floating window의 가장자리 근처에 있는지 계산한다.

동작:

- `.workspace`를 찾는다.
- `[data-dock-id]`가 있는 도킹 대상들을 찾는다.
- 가장자리 80px 안쪽이면 edge dock 후보로 판단한다.
- 가장 가까운 가장자리를 기준으로 방향을 결정한다.
- 미리보기 박스의 CSS 위치/크기를 계산한다.

사용 예:

- 플로팅 창을 화면 오른쪽 끝으로 끌었을 때 오른쪽 도킹 미리보기 표시

---

# 리팩토링 기준

현재 구조에서 역할은 다음처럼 나뉜다.

```txt
App.tsx
→ 앱 시작, 저장 데이터 검사, 기본 레이아웃 생성, 저장 연결

storage/
→ localStorage 저장/불러오기

layouts/
→ 기본 UI 배치 데이터

types/
→ 레이아웃 시스템 공통 타입

components/editor/
→ 도킹 에디터 UI 껍데기

components/panels/
→ 실제 기능 패널 구현

hooks/
→ React 상태와 사용자 입력 처리

utils/
→ 순수 데이터 조작 함수, 위치 계산 함수
```

---

# 패널 추가 방법

새 패널을 추가할 때는 다음 순서로 진행한다.

## 1. 패널 컴포넌트 생성

예:

```txt
components/panels/PianoRoll/PianoRollPanel.tsx
```

```tsx
export function PianoRollPanel() {
  return <div>피아노 롤</div>;
}
```

## 2. `panelRegistry.tsx`에 연결

```tsx
import { PianoRollPanel } from "./PianoRoll/PianoRollPanel";

const panelRegistry = {
  "피아노 롤": PianoRollPanel,
};
```

## 3. `defaultLayout.ts`에 패널 ID 추가

기본 배치에 해당 패널 ID를 넣으면 처음 실행 시 화면에 표시된다.

```ts
{
  type: "tabs",
  ids: ["피아노 롤"],
  activeId: "피아노 롤"
}
```

---

# 저장 데이터 주의점

현재 UI 레이아웃은 localStorage에 자동 저장된다.

따라서 `defaultLayout.ts`를 수정해도, 이미 브라우저에 저장된 레이아웃이 있으면 저장된 레이아웃이 먼저 사용된다.

기본 레이아웃 변경을 확인하려면 localStorage의 `web-mml.editor-layout.v1` 데이터를 지우거나, `clearLayoutState()`를 실행해야 한다.

---

# 앞으로 확장 방향

현재 저장 대상은 UI 배치뿐이다.

나중에는 다음처럼 확장할 수 있다.

```txt
storage/
  layoutStorage.ts      UI 배치 저장
  settingsStorage.ts    앱 설정 저장
  projectStorage.ts     곡/프로젝트 데이터 저장
```

권장 방식:

| 데이터 종류 | 추천 저장소 |
|---|---|
| UI 배치 | localStorage |
| 테마, 단축키 같은 간단한 설정 | localStorage |
| 곡 데이터, 노트 이벤트, 트랙 데이터 | IndexedDB |
| 오디오 샘플, 큰 파일 | IndexedDB 또는 File System Access API |

---

# 한 줄 요약

이 구조는 `App.tsx`를 가볍게 유지하고, 도킹 UI 시스템, 패널 기능, 저장 로직을 각각 독립적으로 개발하기 위한 구조다.
