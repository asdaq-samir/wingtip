/**
 * A replay's captions: what was said on the radio, who said it and when,
 * on the replay's own clock (s since 1970), so the same line is shown
 * over the map, burned into a video and written to an SRT file for an
 * editor. Made on the device from the creator's own recording
 * (features/replay/captions, Whisper), then corrected by hand.
 */
export interface Caption {
  id: string;
  /** When the words start and end, s since 1970 (the replay's clock). */
  from: number;
  to: number;
  /** Who is speaking: "Tower", "N123AB"; empty where not yet labelled. */
  speaker: string;
  text: string;
}

/** A word Whisper heard, its times in s from the start of the audio
 *  (transformers.js's `return_timestamps: "word"` chunks). */
export interface HeardWord {
  text: string;
  timestamp: [number, number | null];
}

/** A pause this long between two words starts a new line: a radio call
 *  is a breath; the reply after the press of a key is longer. */
const NEW_LINE_PAUSE_S = 0.8;
/** And no line runs longer than this, so it fits two lines of a video. */
const MOST_CHARS = 84;

/** The heard words as caption lines on the replay's clock: `audioStartsAt`
 *  is the replay moment the audio's first sample is (the audio's sync). */
export function linesOf(words: HeardWord[], audioStartsAt: number): Caption[] {
  const groups: { from: number; to: number; words: string[] }[] = [];
  for (const w of words) {
    const from = audioStartsAt + w.timestamp[0];
    const to = audioStartsAt + (w.timestamp[1] ?? w.timestamp[0] + 0.3);
    const last = groups.at(-1);
    if (last && from - last.to <= NEW_LINE_PAUSE_S && last.words.join("").length + w.text.length <= MOST_CHARS) {
      last.words.push(w.text);
      last.to = to;
    } else groups.push({ from, to, words: [w.text] });
  }
  return groups
    .map((g) => ({ ...g, text: g.words.join("").replace(/\s+/g, " ").trim() }))
    .filter((g) => g.text)
    .map((g, i) => ({ id: `c${i}-${g.from.toFixed(2)}`, from: g.from, to: g.to, speaker: "", text: g.text }));
}

/** The caption on at `t`, if any. */
export function captionAt(captions: Caption[], t: number): Caption | null {
  return captions.find((c) => t >= c.from && t <= c.to) ?? null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A time from the start of the video as SRT writes it: "00:01:02,345". */
export function srtTime(s: number): string {
  const ms = Math.max(0, Math.round(s * 1000));
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/**
 * The captions as an SubRip (.srt) file for a video of the replay from
 * `start` to `end` (the replay's clock) played `speed` times as flown:
 * each line's times from the video's start, the speaker before the words
 * ("Tower: Cleared to land"), lines outside the range left out and those
 * across its ends cut to it. CRLF line ends, as the format was written.
 */
export function toSrt(captions: Caption[], range: { start: number; end: number; speed: number }): string {
  const shown = captions
    .filter((c) => c.to > range.start && c.from < range.end)
    .sort((a, b) => a.from - b.from)
    .map((c, i) => {
      const from = (Math.max(c.from, range.start) - range.start) / range.speed;
      const to = (Math.min(c.to, range.end) - range.start) / range.speed;
      const words = c.speaker ? `${c.speaker}: ${c.text}` : c.text;
      return `${i + 1}\r\n${srtTime(from)} --> ${srtTime(to)}\r\n${words}\r\n`;
    });
  return shown.join("\r\n");
}
