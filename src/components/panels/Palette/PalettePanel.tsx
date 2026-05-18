import type React from "react";
import { useEffect, useState } from "react";
import {
    getArrangementControlState,
    subscribeArrangementControlState,
} from "../../../core/editor/arrangementControlStore";
import {
    clearPaletteSelection,
    getPaletteState,
    isSamePaletteItem,
    subscribePaletteState,
    togglePaletteItem,
    type NotePaletteDenominator,
    type PaletteItem,
} from "../../../core/editor/paletteStore";
import "./PalettePanel.css";

type DurationPaletteItem = {
    denominator: NotePaletteDenominator;
    noteLabel: string;
    restLabel: string;
    beatLabel: string;
    noteIcon: SpriteCell;
    restIcon: SpriteCell;
};

type CommandToolItem = {
    key: string;
    label: string;
    icon: SpriteCell;
    item: PaletteItem;
};

type CommandToolGroup = {
    key: string;
    items: CommandToolItem[];
};

type SpriteCell = {
    row: number;
    col: number;
};

const DURATION_ITEMS: DurationPaletteItem[] = [
    { denominator: 1, noteLabel: "온음표", restLabel: "온쉼표", beatLabel: "4 박자", noteIcon: { row: 0, col: 0 }, restIcon: { row: 1, col: 0 } },
    { denominator: 2, noteLabel: "2분음표", restLabel: "2분쉼표", beatLabel: "2 박자", noteIcon: { row: 0, col: 1 }, restIcon: { row: 1, col: 1 } },
    { denominator: 4, noteLabel: "4분음표", restLabel: "4분쉼표", beatLabel: "1 박자", noteIcon: { row: 0, col: 2 }, restIcon: { row: 1, col: 2 } },
    { denominator: 8, noteLabel: "8분음표", restLabel: "8분쉼표", beatLabel: "1/2 박자", noteIcon: { row: 0, col: 3 }, restIcon: { row: 1, col: 3 } },
    { denominator: 16, noteLabel: "16분음표", restLabel: "16분쉼표", beatLabel: "1/4 박자", noteIcon: { row: 0, col: 4 }, restIcon: { row: 1, col: 4 } },
    { denominator: 32, noteLabel: "32분음표", restLabel: "32분쉼표", beatLabel: "1/8 박자", noteIcon: { row: 0, col: 5 }, restIcon: { row: 1, col: 5 } },
];

const NOTE_EDIT_TOOL_GROUPS: CommandToolGroup[] = [
    {
        key: "dots",
        items: [
            { key: "dot", label: "점음표", icon: { row: 2, col: 0 }, item: { type: "rhythm-dot", dots: 1 } },
            { key: "double-dot", label: "겹점음표", icon: { row: 2, col: 1 }, item: { type: "rhythm-dot", dots: 2 } },
        ],
    },
    {
        key: "tuplets",
        items: [
            { key: "triplet", label: "셋잇단", icon: { row: 5, col: 0 }, item: { type: "rhythm-tuplet", actual: 3 } },
            { key: "quintuplet", label: "다섯잇단", icon: { row: 5, col: 1 }, item: { type: "rhythm-tuplet", actual: 5 } },
            { key: "septuplet", label: "일곱잇단", icon: { row: 5, col: 2 }, item: { type: "rhythm-tuplet", actual: 7 } },
        ],
    },
    {
        key: "articulations",
        items: [
            { key: "staccato", label: "스타카토", icon: { row: 3, col: 0 }, item: { type: "articulation", articulation: "staccato" } },
            { key: "tenuto", label: "테누토", icon: { row: 3, col: 1 }, item: { type: "articulation", articulation: "tenuto" } },
        ],
    },
    {
        key: "lines",
        items: [
            { key: "tie", label: "붙임줄", icon: { row: 4, col: 0 }, item: { type: "rhythm-tie" } },
            { key: "slur", label: "이음줄", icon: { row: 4, col: 1 }, item: { type: "rhythm-slur" } },
        ],
    },
];

const SUSTAIN_TOOLS: CommandToolItem[] = [
    { key: "sustain-on", label: "서스테인 ON", icon: { row: 4, col: 2 }, item: { type: "sustain", value: true } },
    { key: "sustain-off", label: "서스테인 OFF", icon: { row: 4, col: 3 }, item: { type: "sustain", value: false } },
];

const SHOW_PENDING_PALETTE_TOOLS = false;

export function PalettePanel() {
    const [paletteState, setPaletteState] = useState(() => getPaletteState());
    const [arrangementState, setArrangementState] = useState(() =>
        getArrangementControlState(),
    );

    useEffect(() => {
        return subscribePaletteState((nextState) => {
            setPaletteState(nextState);
        });
    }, []);

    useEffect(() => {
        return subscribeArrangementControlState((nextState) => {
            setArrangementState(nextState);
        });
    }, []);

    const canUseDurationTools = arrangementState.selectedChordId != null;
    const canUseNoteEditTools = arrangementState.selectedNoteId != null;
    const canUseSustainTools = arrangementState.selectedSectionId != null;

    useEffect(() => {
        const selectedItem = paletteState.selectedItem;
        if (selectedItem == null) return;

        if (
            (selectedItem.type === "note-duration" || selectedItem.type === "rest-duration") &&
            !canUseDurationTools
        ) {
            clearPaletteSelection();
            return;
        }

        if (
            (
                selectedItem.type === "rhythm-dot" ||
                selectedItem.type === "rhythm-tuplet" ||
                selectedItem.type === "rhythm-tie" ||
                selectedItem.type === "rhythm-slur" ||
                selectedItem.type === "articulation"
            ) &&
            !canUseNoteEditTools
        ) {
            clearPaletteSelection();
            return;
        }

        if (selectedItem.type === "sustain" && !canUseSustainTools) {
            clearPaletteSelection();
        }
    }, [
        canUseDurationTools,
        canUseNoteEditTools,
        canUseSustainTools,
        paletteState.selectedItem,
    ]);

    return (
        <div className="panel-content palette-panel">
            <PaletteDurationSection
                title="음표"
                ariaLabel="음표"
                itemType="note-duration"
                canUseTools={canUseDurationTools}
                selectedItem={paletteState.selectedItem}
                getLabel={(item) => item.noteLabel}
                getIcon={(item) => item.noteIcon}
            />

            {SHOW_PENDING_PALETTE_TOOLS && (
                <>
                    <div className="palette-divider" />

                    <PaletteDurationSection
                        title="쉼표"
                        ariaLabel="쉼표"
                        itemType="rest-duration"
                        canUseTools={canUseDurationTools}
                        selectedItem={paletteState.selectedItem}
                        getLabel={(item) => item.restLabel}
                        getIcon={(item) => item.restIcon}
                    />

                    <div className="palette-divider" />

                    <PaletteCommandSection
                        title="노트 수정"
                        ariaLabel="노트 수정"
                        groups={NOTE_EDIT_TOOL_GROUPS}
                        canUseTools={canUseNoteEditTools}
                        selectedItem={paletteState.selectedItem}
                    />

                    <div className="palette-divider" />

                    <PaletteCommandSection
                        title="서스테인"
                        ariaLabel="서스테인"
                        groups={[{ key: "sustain", items: SUSTAIN_TOOLS }]}
                        canUseTools={canUseSustainTools}
                        selectedItem={paletteState.selectedItem}
                    />
                </>
            )}
        </div>
    );
}

function PaletteDurationSection({
    title,
    ariaLabel,
    itemType,
    canUseTools,
    selectedItem,
    getLabel,
    getIcon,
}: {
    title: string;
    ariaLabel: string;
    itemType: "note-duration" | "rest-duration";
    canUseTools: boolean;
    selectedItem: PaletteItem | null;
    getLabel: (item: DurationPaletteItem) => string;
    getIcon: (item: DurationPaletteItem) => SpriteCell;
}) {
    return (
        <section className="palette-section" aria-label={ariaLabel}>
            <div className="palette-section-title">{title}</div>
            <div className="palette-tool-grid">
                {DURATION_ITEMS.map((item) => {
                    const label = getLabel(item);
                    const paletteItem: PaletteItem = {
                        type: itemType,
                        denominator: item.denominator,
                    };
                    const isSelected =
                        canUseTools &&
                        isSamePaletteItem(selectedItem, paletteItem);

                    return (
                        <PaletteToolButton
                            key={item.denominator}
                            item={paletteItem}
                            label={`${label} (${item.beatLabel})`}
                            disabled={!canUseTools}
                            isSelected={isSelected}
                        >
                            <PaletteSpriteIcon cell={getIcon(item)} />
                        </PaletteToolButton>
                    );
                })}
            </div>
        </section>
    );
}

function PaletteCommandSection({
    title,
    ariaLabel,
    groups,
    canUseTools,
    selectedItem,
}: {
    title: string;
    ariaLabel: string;
    groups: CommandToolGroup[];
    canUseTools: boolean;
    selectedItem: PaletteItem | null;
}) {
    return (
        <section className="palette-section" aria-label={ariaLabel}>
            <div className="palette-section-title">{title}</div>
            <div className="palette-command-stack">
                {groups.map((group) => (
                    <div key={group.key} className="palette-tool-grid palette-command-grid">
                        {group.items.map((tool) => (
                            <PaletteCommandButton
                                key={tool.key}
                                label={tool.label}
                                disabled={!canUseTools}
                                isSelected={
                                    canUseTools &&
                                    isSamePaletteItem(selectedItem, tool.item)
                                }
                                onClick={() => togglePaletteItem(tool.item)}
                            >
                                <PaletteSpriteIcon cell={tool.icon} />
                            </PaletteCommandButton>
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );
}

function PaletteToolButton({
    item,
    label,
    disabled,
    isSelected,
    children,
}: {
    item: PaletteItem;
    label: string;
    disabled: boolean;
    isSelected: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={
                isSelected
                    ? "palette-tool-button selected"
                    : "palette-tool-button"
            }
            disabled={disabled}
            title={disabled ? "선택 대상이 있을 때 사용할 수 있습니다" : label}
            aria-label={label}
            aria-pressed={isSelected}
            onClick={() => togglePaletteItem(item)}
        >
            <span className="palette-tool-icon-wrap">
                {children}
            </span>
        </button>
    );
}

function PaletteCommandButton({
    label,
    disabled,
    isSelected,
    onClick,
    children,
}: {
    label: string;
    disabled: boolean;
    isSelected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={
                isSelected
                    ? "palette-tool-button selected"
                    : "palette-tool-button"
            }
            disabled={disabled}
            title={disabled ? "선택 대상이 있을 때 사용할 수 있습니다" : label}
            aria-label={label}
            aria-pressed={isSelected}
            onClick={onClick}
        >
            <span className="palette-tool-icon-wrap">
                {children}
            </span>
        </button>
    );
}

function PaletteSpriteIcon({ cell }: { cell: SpriteCell }) {
    const displaySize = 40;
    const cropInset = 5;
    const imageSize = 1254;
    const xLines = [11, 167, 321, 475, 626, 778, 933, 1087, 1241];
    const yLines = [10, 162, 314, 466, 619, 768, 918, 1066, 1239];
    const cropX = xLines[cell.col] + cropInset;
    const cropY = yLines[cell.row] + cropInset;
    const cropWidth = xLines[cell.col + 1] - xLines[cell.col] - cropInset * 2;
    const cropHeight = yLines[cell.row + 1] - yLines[cell.row] - cropInset * 2;
    const backgroundWidth = imageSize * displaySize / cropWidth;
    const backgroundHeight = imageSize * displaySize / cropHeight;
    const backgroundX = cropX * displaySize / cropWidth;
    const backgroundY = cropY * displaySize / cropHeight;

    return (
        <span
            className="palette-sprite-icon"
            aria-hidden="true"
            style={{
                backgroundImage: `url("${import.meta.env.BASE_URL}editor/notations.png")`,
                backgroundPosition: `-${backgroundX}px -${backgroundY}px`,
                backgroundSize: `${backgroundWidth}px ${backgroundHeight}px`,
            }}
        />
    );
}
