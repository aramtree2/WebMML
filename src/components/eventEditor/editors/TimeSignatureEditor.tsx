import { useState } from "react";
import { updateWmlProject } from "../../../core/wml/wmlStore";
import { createId } from "../../../core/wml/wmlUtils";
import type { EventEditorProps, EventEditorTarget } from "../eventEditorTypes";

type TimeSignatureTarget = Extract<EventEditorTarget, { type: "timeSignature" }>;

export function TimeSignatureEditor({
    target,
    project,
    onClose,
}: EventEditorProps<TimeSignatureTarget>) {
    const currentTimeSignature = findTimeSignatureForBar(project.timeSignatures, target.bar);
    const [numerator, setNumerator] = useState(currentTimeSignature.numerator);
    const [denominator, setDenominator] = useState(currentTimeSignature.denominator);

    const applyChanges = () => {
        const nextNumerator = normalizePositiveInteger(numerator, currentTimeSignature.numerator);
        const nextDenominator = normalizePositiveInteger(
            denominator,
            currentTimeSignature.denominator,
        );

        updateWmlProject((prev) => {
            const existing = prev.timeSignatures.find((event) => event.bar === target.bar);
            const previous = findPreviousTimeSignature(prev.timeSignatures, target.bar);

            if (
                previous != null &&
                previous.numerator === nextNumerator &&
                previous.denominator === nextDenominator
            ) {
                return {
                    ...prev,
                    timeSignatures: compactTimeSignatures(
                        prev.timeSignatures.filter((event) => event.bar !== target.bar),
                    ),
                };
            }

            if (existing) {
                return {
                    ...prev,
                    timeSignatures: compactTimeSignatures(
                        prev.timeSignatures.map((event) =>
                            event.id === existing.id
                                ? {
                                      ...event,
                                      numerator: nextNumerator,
                                      denominator: nextDenominator,
                                  }
                                : event,
                        ),
                    ),
                };
            }

            return {
                ...prev,
                timeSignatures: compactTimeSignatures([
                    ...prev.timeSignatures,
                    {
                        id: createId("timesig"),
                        bar: target.bar,
                        numerator: nextNumerator,
                        denominator: nextDenominator,
                    },
                ]),
            };
        });

        onClose();
    };

    return (
        <div className="event-editor-form">
            <div className="event-editor-readonly-row">
                <span className="event-editor-label">Bar</span>
                <span className="event-editor-value">{target.bar + 1}</span>
            </div>

            <div className="event-editor-time-signature-inputs">
                <label className="event-editor-field">
                    <span className="event-editor-label">Numerator</span>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={numerator}
                        onChange={(e) => setNumerator(Number(e.target.value))}
                    />
                </label>

                <span className="event-editor-fraction-divider">/</span>

                <label className="event-editor-field">
                    <span className="event-editor-label">Denominator</span>
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={denominator}
                        onChange={(e) => setDenominator(Number(e.target.value))}
                    />
                </label>
            </div>

            <div className="event-editor-actions">
                <button type="button" onClick={onClose}>
                    취소
                </button>
                <button type="button" className="event-editor-primary-button" onClick={applyChanges}>
                    확인
                </button>
            </div>
        </div>
    );
}

function findTimeSignatureForBar(
    timeSignatures: EventEditorProps<TimeSignatureTarget>["project"]["timeSignatures"],
    bar: number,
) {
    const sorted = [...timeSignatures].sort((a, b) => a.bar - b.bar);
    const explicit = sorted.find((event) => event.bar === bar);
    if (explicit) return explicit;

    const inherited = sorted.filter((event) => event.bar < bar).at(-1);

    return inherited ?? {
        id: "default-timesig",
        bar: 0,
        numerator: 4,
        denominator: 4,
    };
}

function findPreviousTimeSignature(
    timeSignatures: EventEditorProps<TimeSignatureTarget>["project"]["timeSignatures"],
    bar: number,
) {
    return [...timeSignatures]
        .filter((event) => event.bar < bar)
        .sort((a, b) => a.bar - b.bar)
        .at(-1) ?? {
            id: "default-timesig",
            bar: 0,
            numerator: 4,
            denominator: 4,
        };
}

function compactTimeSignatures(
    timeSignatures: EventEditorProps<TimeSignatureTarget>["project"]["timeSignatures"],
) {
    const sorted = [...timeSignatures].sort((a, b) => a.bar - b.bar);
    const result: typeof sorted = [];

    for (const event of sorted) {
        const previous = result[result.length - 1] ?? {
            numerator: 4,
            denominator: 4,
        };

        if (
            result.length > 0 &&
            previous.numerator === event.numerator &&
            previous.denominator === event.denominator
        ) {
            continue;
        }

        if (
            result.length === 0 &&
            event.bar !== 0 &&
            event.numerator === 4 &&
            event.denominator === 4
        ) {
            continue;
        }

        result.push(event);
    }

    return result;
}

function normalizePositiveInteger(value: number, fallback: number) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
}
