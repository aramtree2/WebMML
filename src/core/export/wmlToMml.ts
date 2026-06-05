import type {
    WmlProject,
    WmlSection,
    NoteEvent,
    TempoEvent,
} from "../wml/wmlTypes";

const TPQN = 480;



function pitchToNote(pitch: number): { note: string; octave: number } {
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

function noteMML(noteName: string, tick: number): string {
    const parts = getDurationMMLParts(tick);

    if (parts.length === 0) {
        return noteName + "4";
    }

    return parts
        .map((duration) => noteName + duration)
        .join("&");
}

function chordToMMLPart(chordNotes: NoteEvent[]): string {
    const notes = chordNotes
        .slice()
        .sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.pitch - b.pitch;
        });

    const result: string[] = [];

    let currentTick = 0;
    let currentOctave = 4;
    let currentVelocity = 8;

    for (const note of notes) {
        if (note.tick > currentTick) {
            result.push(restMML(note.tick - currentTick));
            currentTick = note.tick;
        }

        const { note: noteName, octave } = pitchToNote(note.pitch);

        if (octave !== currentOctave) {
            result.push("O" + octave);
            currentOctave = octave;
        }

        if (note.velocity !== currentVelocity) {
            result.push("V" + note.velocity);
            currentVelocity = note.velocity;
        }

        result.push(noteMML(noteName, note.duration));

        currentTick = Math.max(
            currentTick,
            note.tick + note.duration
        );
    }

    return result.join("");
}

function sectionToMML(section: WmlSection, tempoEvents: TempoEvent[]): string {
    const parts: string[] = [];

    const tempoPrefix = tempoEvents
        .slice()
        .sort((a, b) => a.tick - b.tick)
        .filter((tempo) => tempo.tick === 0)
        .map((tempo) => "T" + tempo.bpm)
        .join("");

    const sustainPrefix = section.sustain
        .slice()
        .sort((a, b) => a.tick - b.tick)
        .filter((sustain) => sustain.tick === 0)
        .map((sustain) => "S" + sustain.value)
        .join("");

    section.chords
        .slice()
        .sort((a, b) => {
            const aTick = a.notes[0]?.tick ?? 0;
            const bTick = b.notes[0]?.tick ?? 0;
            return aTick - bTick;
        })
        .forEach((chord, chordIndex) => {
            const prefix = chordIndex === 0 ? tempoPrefix + sustainPrefix : "";
            parts.push(prefix + chordToMMLPart(chord.notes));
        });

    return parts.join(",");
}

export function wmlToMml(input: WmlProject | string): string {
    const wml: WmlProject =
        typeof input === "string" ? (JSON.parse(input) as WmlProject) : input;

    const tempos = wml.tempos ?? [];
    const sections = wml.sections ?? [];

    return sections
        .map((section, index) => {
            const sectionMml = sectionToMML(section, tempos);

            return [
                `mml-track=${"MML@" + sectionMml + ";"}`,
                `name=Track ${index + 1}`,
                `program=${section.instrument ?? 1}`,
            ].join("\n");
        })
        .join("\n\n");
}

export function wmlFileToMmlText(wmlJsonText: string): string {
    const wml = JSON.parse(wmlJsonText) as WmlProject;
    return wmlToMml(wml);
}

function getDurationMMLParts(tick: number): string[] {
    const units: { duration: number; text: string }[] = [];

    for (const len of [1, 2, 4, 8, 16, 32, 64]) {
        const base = (TPQN * 4) / len;

        units.push({ duration: Math.round(base * 1.75), text: `${len}..` });
        units.push({ duration: Math.round(base * 1.5), text: `${len}.` });
        units.push({ duration: Math.round(base), text: String(len) });
    }

    units.sort((a, b) => b.duration - a.duration);

    const result: string[] = [];
    let remain = Math.round(tick);

    while (remain > 0) {
        const unit =
            units.find((u) => u.duration <= remain) ??
            units[units.length - 1];

        result.push(unit.text);
        remain -= unit.duration;

        if (result.length > 10000) break;
    }

    return result;
}

function restMML(tick: number): string {
    return getDurationMMLParts(tick)
        .map((duration) => "R" + duration)
        .join("");
}

