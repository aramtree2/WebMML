import type React from "react";
import {
    isPanelId,
    normalizePanelId,
    PANEL_IDS,
    type PanelId,
} from "../../constants/panels";
import { InstrumentPanel } from "./Instrument";
import { MmlCodePanel } from "./MmlCode";
import { PalettePanel } from "./Palette";
import { PianoRollPanel } from "./PianoRoll";
import { PlaybackPanel } from "./Playback";
import { ScorePanel } from "./Score";
import { VirtualPianoPanel } from "./VirtualPiano";
import { PanelEmptyState } from "./Common";

type PanelRenderer = () => React.ReactNode;

const panelRegistry: Record<PanelId, PanelRenderer> = {
    [PANEL_IDS.PALETTE]: () => <PalettePanel />,
    [PANEL_IDS.PIANO_ROLL]: () => <PianoRollPanel />,
    [PANEL_IDS.SCORE]: () => <ScorePanel />,
    [PANEL_IDS.VIRTUAL_PIANO]: () => <VirtualPianoPanel />,
    [PANEL_IDS.INSTRUMENT]: () => <InstrumentPanel />,
    [PANEL_IDS.MML_CODE]: () => <MmlCodePanel />,
    [PANEL_IDS.PLAYBACK]: () => <PlaybackPanel />,
};

export function renderPanel(id: string) {
    const normalizedId = normalizePanelId(id);

    if (isPanelId(normalizedId)) {
        return panelRegistry[normalizedId]();
    }

    return <PanelEmptyState id={id} />;
}
