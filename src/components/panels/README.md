# panels

실제 기능 패널을 모아두는 폴더입니다.

`components/editor`는 도킹/탭/플로팅 창 같은 에디터 껍데기를 담당하고,  
`components/panels`는 피아노 롤, 악보, 가상 피아노 같은 실제 기능 UI를 담당합니다.

## 구조

```txt
panels/
  panelRegistry.tsx

  Palette/
    PalettePanel.tsx
    index.ts

  PianoRoll/
    PianoRollPanel.tsx
    index.ts

  Score/
    ScorePanel.tsx
    index.ts

  VirtualPiano/
    VirtualPianoPanel.tsx
    index.ts

  Instrument/
    InstrumentPanel.tsx
    index.ts

  MmlCode/
    MmlCodePanel.tsx
    index.ts

  Playback/
    PlaybackPanel.tsx
    index.ts

  Common/
    PanelEmptyState.tsx
    index.ts
```

## panelRegistry.tsx

패널 ID와 실제 React 컴포넌트를 연결합니다.

예:

```tsx
"피아노 롤": () => <PianoRollPanel />
```

`PanelFrame`에서는 직접 패널 컴포넌트를 알 필요 없이 `renderPanel(id)`만 호출합니다.

## 각 패널 폴더

각 패널은 하나의 작은 모듈처럼 관리합니다.

예:

```txt
PianoRoll/
  PianoRollPanel.tsx
  index.ts
```

- `PianoRollPanel.tsx`: 실제 피아노 롤 UI 구현
- `index.ts`: 외부 import를 깔끔하게 하기 위한 export 파일

## Common

여러 패널에서 같이 쓸 공통 컴포넌트를 넣습니다.
