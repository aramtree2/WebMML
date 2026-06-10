import type {
    WmlProject,
    WmlSection,
    NoteEvent,
    TempoEvent,
} from "../wml/wmlTypes";

const TPQN = 480;

function pitchToNote(
    pitch: number
): { note: string; octave: number } {
    const names = [
        "C",
        "C+",
        "D",
        "D+",
        "E",
        "F",
        "F+",
        "G",
        "G+",
        "A",
        "A+",
        "B",
    ];

    return {
        note: names[((pitch % 12) + 12) % 12],
        octave: Math.floor(pitch / 12) - 1,
    };
}

function octaveCommand(
    current: number,
    target: number
): string {
    const diff = target - current;

    if (diff === 0) {
        return "";
    }

    if (Math.abs(diff) <= 2) {
        return diff > 0
            ? ">".repeat(diff)
            : "<".repeat(-diff);
    }

    return "O" + target;
}

function noteMML(
    noteName: string,
    tick: number
): string {
    const parts = getDurationMMLParts(tick);

    if (parts.length === 0) {
        return noteName + "4";
    }

    return parts
        .map(
            (duration) =>
                noteName + duration
        )
        .join("&");
}

function chordToMMLPart(
    chordNotes: NoteEvent[]
): string {
    const notes = chordNotes
        .slice()
        .sort((a, b) => {
            if (a.tick !== b.tick) {
                return a.tick - b.tick;
            }

            return a.pitch - b.pitch;
        });

    const result: string[] = [];

    let playhead = 0;
    let currentOctave = 4;
    let currentVelocity = 8;

    for (const note of notes) {
        const gap = note.tick - playhead;

        if (gap > 0) {
            result.push(restMML(gap));
        }

        const {
            note: noteName,
            octave,
        } = pitchToNote(note.pitch);

        if (octave !== currentOctave) {
            result.push(
                octaveCommand(
                    currentOctave,
                    octave
                )
            );

            currentOctave = octave;
        }

        if (note.velocity !== currentVelocity) {
            result.push("V" + note.velocity);
            currentVelocity = note.velocity;
        }

        result.push(
            noteMML(
                noteName,
                note.duration
            )
        );

        playhead =
            note.tick +
            note.duration;
    }

    return result.join("");
}

function sectionToMML(
    section: WmlSection,
    tempoEvents: TempoEvent[]
): string {
    const parts: string[] = [];

    const tempoPrefix = tempoEvents
        .slice()
        .sort((a, b) => a.tick - b.tick)
        .filter(
            (tempo) =>
                tempo.tick === 0
        )
        .map(
            (tempo) =>
                "T" + tempo.bpm
        )
        .join("");

    const sustainPrefix = section.sustain
        .slice()
        .sort((a, b) => a.tick - b.tick)
        .filter(
            (sustain) =>
                sustain.tick === 0 &&
                sustain.value !== 0
        )
        .map(
            (sustain) =>
                "S" + sustain.value
        )
        .join("");

    section.chords
        .slice()
        .sort((a, b) => {
            const aTick =
                a.notes[0]?.tick ?? 0;

            const bTick =
                b.notes[0]?.tick ?? 0;

            return aTick - bTick;
        })
        .forEach(
            (chord, index) => {
                const prefix =
                    index === 0
                        ? tempoPrefix +
                          sustainPrefix
                        : "";

                parts.push(
                    prefix +
                        chordToMMLPart(
                            chord.notes
                        )
                );
            }
        );

    return parts.join("");
}

export function wmlToMml(
    input: WmlProject | string
): string {
    const wml: WmlProject =
        typeof input === "string"
            ? (JSON.parse(
                  input
              ) as WmlProject)
            : input;

    const tempos =
        wml.tempos ?? [];

    const sections =
        wml.sections ?? [];

    return sections
        .map(
            (section, index) => {
                const sectionMml =
                    sectionToMML(
                        section,
                        tempos
                    );

                return [
                    `mml-track=MML@${sectionMml};`,
                    `name=Track ${index + 1}`,
                    `program=${section.instrument ?? 1}`,
                ].join("\n");
            }
        )
        .join("\n\n");
}

export function wmlFileToMmlText(
    wmlJsonText: string
): string {
    const wml = JSON.parse(
        wmlJsonText
    ) as WmlProject;

    return wmlToMml(wml);
}

const durationCache =
    new Map<number, string[]>();

function getDurationMMLParts(
    tick: number
): string[] {
    tick = Math.round(tick);

    const cached =
        durationCache.get(tick);

    if (cached) {
        return cached;
    }

    const units: {
        duration: number;
        text: string;
    }[] = [];

    for (let len = 1; len <= 64; len++) {
        const base =
            (TPQN * 4) / len;

        let mul = 1;
        let add = 0.5;

        units.push({
            duration: Math.round(base),
            text: String(len),
        });

        for (
            let dots = 1;
            dots <= 4;
            dots++
        ) {
            mul += add;
            add /= 2;

            units.push({
                duration: Math.round(
                    base * mul
                ),
                text:
                    String(len) +
                    ".".repeat(dots),
            });
        }
    }

    const INF = 1e9;

    const dp =
        new Array(tick + 1).fill(INF);

    const prev =
        new Array(tick + 1).fill(-1);

    const prevUnit =
        new Array(tick + 1).fill(-1);

    dp[0] = 0;

    for (let i = 0; i <= tick; i++) {
        if (dp[i] === INF) {
            continue;
        }

        units.forEach(
            (unit, idx) => {
                const next =
                    i + unit.duration;

                if (next > tick) {
                    return;
                }

                const cost =
                    dp[i] +
                    unit.text.length +
                    1;

                if (
                    cost <
                    dp[next]
                ) {
                    dp[next] =
                        cost;

                    prev[next] = i;

                    prevUnit[next] =
                        idx;
                }
            }
        );
    }

    if (dp[tick] === INF) {
        return ["4"];
    }

    const result: string[] =
        [];

    let cur = tick;

    while (cur > 0) {
        const idx =
            prevUnit[cur];

        result.push(
            units[idx].text
        );

        cur = prev[cur];
    }

    result.reverse();

    durationCache.set(
        tick,
        result
    );

    return result;
}

function restMML(
    tick: number
): string {
    return getDurationMMLParts(tick)
        .map(
            (duration) =>
                "R" + duration
        )
        .join("");
}