import type { LoopSpeed } from "../../lib/map/sources/weatherLayers";
import { ago, clockTime, zoneName, zuluTime } from "../../lib/format/time";

/** How long each frame is shown at each speed, ms. */
export const FRAME_MS: Record<LoopSpeed, number> = { slow: 900, normal: 500, fast: 250 };

/** How long the frames are given to load before the loop plays whatever
 *  has come, ms: a slow signal must not keep it still for good. */
export const PRELOAD_CAP_MS = 8000;

/** The speeds as the menu lists them. */
export const SPEEDS: { value: LoopSpeed; label: string }[] = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

/** A frame's time as the bar writes it: in Zulu, as reports give it; on
 *  this device's clock with its zone; its age; and whether it is old --
 *  older than the planner's `old_after_s` for this source
 *  (wingtip.weather_loop), which the bar says plainly. */
export function frameTime(validIso: string, nowMs: number, oldAfterS: number) {
  const at = new Date(validIso);
  const sinceMs = nowMs - at.getTime();
  return { zulu: zuluTime(at), local: `${clockTime(at)} ${zoneName(at)}`, age: ago(sinceMs), old: sinceMs > oldAfterS * 1000 };
}

/** The frame after `index` of `count` in a pass, or null at the newest:
 *  the loop plays once and stops on what is there now, where it went
 *  round for as long as the bar was up -- anything that moves by itself
 *  for more than five seconds needs to stop (WCAG 2.2.2, docs/design/web.md
 *  §7), and the newest frame is the one a pilot is left looking at. */
export const nextInPass = (index: number, count: number): number | null => (index + 1 < count ? index + 1 : null);

/** Where Play starts a pass: from the oldest frame when it stands on the
 *  newest (a pass ended, or the newest followed), else from where it is. */
export const playFrom = (shown: number, count: number): number => (shown < 0 || shown >= count - 1 ? 0 : shown);

/** How the loop starts once its frames are in: played once through, or,
 *  where the pilot asked for less motion, the newest frame still --
 *  nothing moves by itself under Reduce Motion (web.md §7). `index` null
 *  follows the newest frame. */
export const firstPlay = (reducedMotion: boolean): { playing: boolean; index: number | null } =>
  reducedMotion ? { playing: false, index: null } : { playing: true, index: 0 };

/** How long to stay on each frame at `speed`. */
export const dwellMs = (speed: LoopSpeed) => FRAME_MS[speed];
