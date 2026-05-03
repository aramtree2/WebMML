export const PANEL_IDS = {
    PALETTE: "palette",
    PIANO_ROLL: "piano-roll",
    SCORE: "score",
    VIRTUAL_PIANO: "virtual-piano",
    INSTRUMENT: "instrument",
    MML_CODE: "mml-code",
    PLAYBACK: "playback",
} as const;

export type PanelId = (typeof PANEL_IDS)[keyof typeof PANEL_IDS];

export const PANEL_TITLES: Record<PanelId, string> = {
    [PANEL_IDS.PALETTE]: "팔레트",
    [PANEL_IDS.PIANO_ROLL]: "피아노 롤",
    [PANEL_IDS.SCORE]: "악보",
    [PANEL_IDS.VIRTUAL_PIANO]: "가상 피아노",
    [PANEL_IDS.INSTRUMENT]: "악기 구성",
    [PANEL_IDS.MML_CODE]: "MML 코드 표",
    [PANEL_IDS.PLAYBACK]: "재생 패널",
};

const LEGACY_PANEL_ID_MAP: Record<string, PanelId> = {
    팔레트: PANEL_IDS.PALETTE,
    "피아노 롤": PANEL_IDS.PIANO_ROLL,
    악보: PANEL_IDS.SCORE,
    "가상 피아노": PANEL_IDS.VIRTUAL_PIANO,
    "악기 구성": PANEL_IDS.INSTRUMENT,
    "MML 코드 표": PANEL_IDS.MML_CODE,
    "mml 코드 표": PANEL_IDS.MML_CODE,
    "재생 패널": PANEL_IDS.PLAYBACK,
};

export function isPanelId(id: string): id is PanelId {
    return Object.values(PANEL_IDS).includes(id as PanelId);
}

export function normalizePanelId(id: string): PanelId | string {
    return LEGACY_PANEL_ID_MAP[id] ?? id;
}

export function getPanelTitle(id: string): string {
    const normalizedId = normalizePanelId(id);

    if (isPanelId(normalizedId)) {
        return PANEL_TITLES[normalizedId];
    }

    return id;
}
