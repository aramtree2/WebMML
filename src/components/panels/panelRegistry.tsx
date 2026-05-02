const panelNames = [
    "팔레트",
    "피아노 롤",
    "악보",
    "가상 피아노",
    "악기 구성",
    "mml 코드 표",
    "재생 패널",
];

function PlaceholderPanel({ name }: { name: string }) {
    return <div className="panel-content">{name}</div>;
}

export function renderPanel(panelId: string) {
    if (!panelNames.includes(panelId)) {
        return <PlaceholderPanel name={panelId} />;
    }

    return <PlaceholderPanel name={panelId} />;
}
