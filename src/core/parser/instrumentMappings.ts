export const MIDI_PROGRAM_TO_INSTRUMENT_ID: Record<number, string> = { //1~128기반
    1: "SGM_Piano",
    6: "SGM_ElectricPiano",
    17: "SGM_Organ",
    25: "SGM_AcousticGuitar",
    28: "SGM_ElectricGuitar",
    34: "SGM_Bass",
    37: "SGM_SlapBass",
    41: "SGM_Violin",
    43: "SGM_Cello",
    47: "SGM_Harp",
    49: "SGM_Strings",
    53: "SGM_Choir",
    57: "SGM_Trumpet",
    61: "SGM_FrenchHorn",
    66: "SGM_AltoSax",
    69: "SGM_Oboe",
    74: "SGM_Flute",
    81: "SGM_SquareLead",
    89: "SGM_Pad",
    115: "SGM_SteelDrums",
};

export const INSTRUMENT_LABELS: Record<string, string> = {
    SGM_Piano: "피아노",
    SGM_ElectricPiano: "전자 피아노",
    SGM_Organ: "오르간",
    SGM_AcousticGuitar: "어쿠스틱 기타",
    SGM_ElectricGuitar: "일렉 기타",
    SGM_Bass: "베이스",
    SGM_SlapBass: "슬랩 베이스",
    SGM_Violin: "바이올린",
    SGM_Cello: "첼로",
    SGM_Harp: "하프",
    SGM_Strings: "스트링",
    SGM_Choir: "콰이어",
    SGM_Trumpet: "트럼펫",
    SGM_FrenchHorn: "프렌치 호른",
    SGM_AltoSax: "알토 색소폰",
    SGM_Oboe: "오보에",
    SGM_Flute: "플룻",
    SGM_SquareLead: "스퀘어 리드",
    SGM_Pad: "패드",
    SGM_SteelDrums: "스틸 드럼",
};

export const INSTRUMENT_ID_TO_MIDI_PROGRAM: Record<string, number> =
    Object.fromEntries(
        Object.entries(MIDI_PROGRAM_TO_INSTRUMENT_ID).map(
            ([program, id]) => [id, Number(program)]
        )
    );