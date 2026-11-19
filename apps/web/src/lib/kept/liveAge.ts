import { callEngine, type EngineInput } from "../engine/engine";
import { duration } from "../format";
import { keptAge, type KeptKind } from "./keptAge";

/** What a live figure is, for the engine's rule of how long it is good:
 *  a weather product (`weather_in_force`: a METAR for its hour, AIM
 *  7-1-28) or an answer the app keeps (`kept_age`: the plan's winds, the
 *  NOTAMs, each its own freshness) or an airplane heard (`traffic_fresh`:
 *  its position for the half minute the planner carries it). */
export type Freshness = { product: EngineInput<"weather_in_force">["product"] } | { kept: KeptKind } | { traffic: true };

/** A live figure's age in a few characters ("12m", the app's durations)
 *  and whether the engine says it is past its freshness; null where the
 *  time is not known. Nothing here judges an age: the engine does. */
export function liveAge(what: Freshness, atMs: number | null | undefined, nowMs: number): { words: string; stale: boolean } | null {
  if (atMs == null || !Number.isFinite(atMs) || atMs <= 0) return null;
  const seconds = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  // An airplane heard is told in seconds under a minute: its position is
  // good for half of one.
  const words = minutes >= 1 ? duration(minutes) : "traffic" in what ? `${seconds}s` : "now";
  try {
    const stale =
      "product" in what
        ? !callEngine("weather_in_force", { product: what.product, now: Math.floor(nowMs / 1000), observed: Math.floor(atMs / 1000) })
        : "kept" in what
          ? keptAge(what.kept, atMs, nowMs)?.finding === "caution"
          : !callEngine("traffic_fresh", { age_s: seconds, planes: [{ seen_s: 0 }] })[0];
    return { words, stale };
  } catch {
    // The engine not in yet: the age, judged once it is.
    return { words, stale: false };
  }
}
