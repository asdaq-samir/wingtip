import type { LoopSpeed } from "../../lib/map/sources/weatherLayers";
import { ago, clockTime, zoneName, zuluTime } from "../../lib/format/time";

/** How long each frame is shown at each speed, ms. */
export const FRAME_MS: Record<LoopSpeed, number> = { slow: 900, normal: 500, fast: 250 };

/** How long the newest frame is held before the loop starts again, ms:
 *  the eye needs a moment on what is there now. */
export const NEWEST_HOLD_MS = 1500;

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

/** The frame after `index` of `count`, back to the first after the last. */
export const nextFrame = (index: number, count: number) => (count ? (index + 1) % count : 0);

/** How long to stay on frame `index` of `count` at `speed`. */
export const dwellMs = (index: number, count: number, speed: LoopSpeed) => (index === count - 1 ? NEWEST_HOLD_MS : FRAME_MS[speed]);
