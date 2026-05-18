import { useState } from "react";
import { updateWmlProject } from "../../../core/wml/wmlStore";
import type { EventEditorProps, EventEditorTarget } from "../eventEditorTypes";

type TempoTarget = Extract<EventEditorTarget, { type: "tempo" }>;

export function TempoEditor({
    target,
    project,
    onClose,
}: EventEditorProps<TempoTarget>) {
    const currentTempo = project.tempos.find((tempo) => tempo.id === target.eventId) ??
        project.tempos.find((tempo) => tempo.tick === target.tick) ?? {
            id: "new-tempo",
            tick: target.tick,
            bpm: 120,
    };
    const [bpm, setBpm] = useState(currentTempo.bpm);
    const nextBpm = normalizeBpm(bpm, currentTempo.bpm);
    const isDuplicate = isDuplicateTempo(project.tempos, target.eventId, currentTempo.tick, nextBpm);
    const canDelete = currentTempo.tick !== 0;

    const applyChanges = () => {
        if (isDuplicate) return;

        updateWmlProject((prev) => {
            const existing = prev.tempos.find((tempo) => tempo.id === target.eventId) ??
                prev.tempos.find((tempo) => tempo.tick === target.tick);

            if (existing) {
                return {
                    ...prev,
                    tempos: compactTempos(prev.tempos
                        .map((tempo) =>
                            tempo.id === existing.id
                                ? {
                                      ...tempo,
                                      bpm: nextBpm,
                                  }
                                : tempo,
                        )),
                };
            }

            return {
                ...prev,
                tempos: compactTempos([
                    ...prev.tempos,
                    {
                        id: crypto.randomUUID(),
                        tick: currentTempo.tick,
                        bpm: nextBpm,
                    },
                ]),
            };
        });

        onClose();
    };

    const cancelTempo = () => {
        if (target.isNew) {
            deleteTempo();
            return;
        }

        onClose();
    };

    const deleteTempo = () => {
        updateWmlProject((prev) => ({
            ...prev,
            tempos: prev.tempos.filter((tempo) => tempo.id !== target.eventId),
        }));

        onClose();
    };

    return (
        <div className="event-editor-form">
            <div className="event-editor-readonly-row">
                <span className="event-editor-label">Tick</span>
                <span className="event-editor-value">{currentTempo.tick}</span>
            </div>

            <label className="event-editor-field">
                <span className="event-editor-label">Tempo</span>
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value))}
                />
            </label>

            <div className="event-editor-actions">
                <button
                    type="button"
                    className="event-editor-danger-button"
                    disabled={!canDelete}
                    onClick={deleteTempo}
                >
                    삭제
                </button>
                <button type="button" onClick={cancelTempo}>
                    취소
                </button>
                <button
                    type="button"
                    className="event-editor-primary-button"
                    disabled={isDuplicate}
                    onClick={applyChanges}
                >
                    확인
                </button>
            </div>
        </div>
    );
}

function isDuplicateTempo(
    tempos: EventEditorProps<TempoTarget>["project"]["tempos"],
    eventId: string | undefined,
    tick: number,
    bpm: number,
) {
    const otherTempos = tempos.filter((tempo) => tempo.id !== eventId);

    if (otherTempos.some((tempo) => tempo.tick === tick)) {
        return true;
    }

    const previous = [...otherTempos]
        .filter((tempo) => tempo.tick < tick)
        .sort((a, b) => a.tick - b.tick)
        .at(-1);

    if (previous) {
        return previous.bpm === bpm;
    }

    return tick > 0 && bpm === 120;
}

function compactTempos(
    tempos: EventEditorProps<TempoTarget>["project"]["tempos"],
) {
    const byTick = new Map<number, (typeof tempos)[number]>();

    for (const tempo of tempos) {
        byTick.set(tempo.tick, tempo);
    }

    const sorted = [...byTick.values()].sort((a, b) => a.tick - b.tick);
    const result: typeof sorted = [];

    for (const tempo of sorted) {
        const previous = result[result.length - 1];

        if (previous && previous.bpm === tempo.bpm) {
            continue;
        }

        if (!previous && tempo.tick > 0 && tempo.bpm === 120) {
            continue;
        }

        result.push(tempo);
    }

    return result;
}

function normalizeBpm(value: number, fallback: number) {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}
