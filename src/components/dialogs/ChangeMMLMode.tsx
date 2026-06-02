import { useMemo, useState } from "react";
import { DialogFrame } from "./DialogFrame";

import { getWmlProject, setWmlProject } from "../../core/wml/wmlStore";
import { setMmlMode } from "../../core/editor/editorSettingsStore";
import {
    convertWmlToMmlMode,
    convertWmlToNormalMode,
} from "../../core/wml/wmlMmlMode";

import "./ChangeMMLMode.css";

type ChangeMMLModeProps = {
    enabled: boolean;
    onConfirm: () => void;
    onClose: () => void;
};

function getSections(wml: any) {
    return wml.sections ?? wml.Sections ?? [];
}

function getChords(section: any) {
    return section.chords ?? section.Chords ?? [];
}

function getNotes(chord: any) {
    return Array.isArray(chord)
        ? chord
        : chord.notes ?? chord.Notes ?? [];
}

function getSectionSummary(wml: any) {
    return getSections(wml).map((section: any, sectionIndex: number) => {
        const chords = getChords(section);

        return {
            sectionIndex,
            sectionName:
                section.name ??
                section.Name ??
                `Section ${sectionIndex + 1}`,
            chordCount: chords.length,
            noteCount: chords.reduce(
                (sum: number, chord: any) => sum + getNotes(chord).length,
                0
            ),
        };
    });
}

function ChordSplitBar({
    count,
    active,
}: {
    count: number;
    active: boolean;
}) {
    const safeCount = Math.max(count, 1);

    return (
        <div className="chord-split-bar">
            {Array.from({ length: safeCount }).map((_, index) => (
                <div
                    key={index}
                    className={
                        active
                            ? "chord-segment active"
                            : "chord-segment"
                    }
                />
            ))}
        </div>
    );
}

export function ChangeMMLMode({
    enabled,
    onClose,
    onConfirm,
}: ChangeMMLModeProps) {
    const [error, setError] = useState("");

    const preview = useMemo(() => {
        try {
            const before = getWmlProject();

            const after = enabled
                ? convertWmlToMmlMode(before)
                : convertWmlToNormalMode(before);

            return {
                beforeSummary: getSectionSummary(before),
                afterSummary: getSectionSummary(after),
                converted: after,
            };
        } catch (err) {
            console.error(err);
            return null;
        }
    }, [enabled]);

    const handleConfirm = () => {
        try {
            if (!preview) return;

            setWmlProject(preview.converted);
            setMmlMode(enabled);

            onConfirm();
        } catch (err) {
            console.error(err);
            setError("MML 모드 변경 중 오류가 발생했습니다.");
        }
    };

    return (
        <DialogFrame
            title={enabled ? "MML 모드 켜기" : "MML 모드 끄기"}
            onClose={onClose}
            onConfirm={handleConfirm}
        >
            <div className="import-dialog">
                <h3>
                    {enabled
                        ? "화음을 MML 모드 구조로 분리합니다."
                        : "분리된 화음을 일반 구조로 병합합니다."}
                </h3>

                <p className="helper-text">
                    {enabled
                        ? "한 화음 안의 여러 노트를 각각 별도 화음으로 분리합니다."
                        : "같은 tick에 있는 노트들을 다시 하나의 화음으로 병합합니다."}
                </p>

                {preview && (
                    <div className="mml-simple-preview">
                        {preview.beforeSummary.map(
                            (beforeSection: any, index: number) => {
                                const afterSection =
                                    preview.afterSummary[index];

                                const beforeCount =
                                    beforeSection.chordCount;

                                const afterCount =
                                    afterSection?.chordCount ?? 0;

                                return (
                                    <div
                                        className="section-change-card"
                                        key={beforeSection.sectionIndex}
                                    >
                                        <div className="section-change-title">
                                            {beforeSection.sectionName}
                                        </div>

                                        <div className="bar-row">
                                            <span className="bar-label">
                                                변경 전
                                            </span>

                                            <ChordSplitBar
                                                count={beforeCount}
                                                active={false}
                                            />

                                            <span className="bar-count">
                                                {beforeCount}개
                                            </span>
                                        </div>

                                        <div className="bar-row">
                                            <span className="bar-label">
                                                변경 후
                                            </span>

                                            <ChordSplitBar
                                                count={afterCount}
                                                active={true}
                                            />

                                            <span className="bar-count">
                                                {afterCount}개
                                            </span>
                                        </div>
                                    </div>
                                );
                            }
                        )}
                    </div>
                )}

                {error && <p className="error-text">{error}</p>}
            </div>
        </DialogFrame>
    );
}