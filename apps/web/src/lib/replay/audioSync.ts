/**
 * A recording of the radio (the creator's own file) on the replay's
 * clock: one point set by hand -- "this moment in the audio is
 * 14:32:05Z" -- fixes every other, as the recording plays at the speed
 * it was made. What the audio player does as the replay plays, scrubs or
 * changes speed follows from it.
 */
export interface AudioSync {
  /** A moment in the recording, s from its start ... */
  audioS: number;
  /** ... and the replay's moment it is, s since 1970. */
  clockT: number;
}

/** Above this many times as flown the radio is muted: words at three
 *  times their speed are noise, not speech. */
export const MOST_AUDIBLE_SPEED = 2;
/** The player is put back on the clock once it has drifted this far, s:
 *  less is heard as a stutter, more as words out of step. */
const MOST_DRIFT_S = 0.25;

/** Where in the recording the replay's moment `t` is, s (outside it
 *  where below 0 or past its length). */
export const audioAt = (sync: AudioSync, t: number) => sync.audioS + (t - sync.clockT);

/** The replay's moment a place in the recording is. */
export const clockAt = (sync: AudioSync, audioS: number) => sync.clockT + (audioS - sync.audioS);

/** The replay moment the recording's first sample is. */
export const audioStart = (sync: AudioSync) => clockAt(sync, 0);

/** The sync from a Zulu time typed for the place the recording is at:
 *  "14:32:05Z" (or without the Z, or "143205") on the replay's UTC day,
 *  the day of `dayOf` (any moment of the replay). Null if it is no time. */
export function syncFromZulu(text: string, audioS: number, dayOf: number): AudioSync | null {
  const m = /^\s*(\d{1,2}):?(\d{2}):?(\d{2})(?:\.(\d+))?\s*Z?\s*$/i.exec(text);
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (h > 23 || min > 59 || s > 59) return null;
  const day = new Date(dayOf * 1000);
  const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, min, s) / 1000 + Number(`0.${m[4] ?? 0}`);
  return { audioS, clockT: t };
}

/**
 * What the player does for the replay at `t` (s since 1970), playing or
 * not at `speed`, the player now at `playerS` in a recording `lengthS`
 * long: whether it plays, at what rate, and where it is put if it has
 * drifted (null: leave it). Silent outside the recording, while paused,
 * and above MOST_AUDIBLE_SPEED.
 */
export function playerPlan(
  sync: AudioSync,
  clock: { t: number; playing: boolean; speed: number },
  player: { atS: number; lengthS: number },
): { play: boolean; rate: number; seekTo: number | null } {
  const want = audioAt(sync, clock.t);
  const inside = want >= 0 && want < player.lengthS;
  const play = clock.playing && inside && clock.speed <= MOST_AUDIBLE_SPEED;
  const kept = Math.min(Math.max(want, 0), player.lengthS);
  const seekTo = Math.abs(player.atS - kept) > MOST_DRIFT_S ? kept : null;
  return { play, rate: clock.speed, seekTo };
}

/** The samples of a recording that fall in the replay from `start` to
 *  `end`, as sample indices of a buffer at `sampleRate`, with how many
 *  silent samples come before them (the video starting before the
 *  recording does): for the video's audio track. */
export function audioSpan(
  sync: AudioSync,
  range: { start: number; end: number },
  sampleRate: number,
  lengthSamples: number,
): { lead: number; from: number; to: number } {
  const want = Math.round(audioAt(sync, range.start) * sampleRate);
  const end = Math.round(audioAt(sync, range.end) * sampleRate);
  const from = Math.min(Math.max(want, 0), lengthSamples);
  const to = Math.min(Math.max(end, from), lengthSamples);
  return { lead: Math.max(0, -want), from, to };
}
