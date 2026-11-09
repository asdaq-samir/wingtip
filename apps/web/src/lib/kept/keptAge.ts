import { useSaved } from "../fromCache";
import { callEngine, type EngineAnswer, type EngineInput } from "../engine/engine";
import { useMinuteClock } from "../useMinuteClock";
import { useOnline } from "./useOnline";

/**
 * A kept answer's age, as the page says it with no signal ("Fetched 42 min
 * ago"), and whether it is past its freshness: the engine's `kept_age`,
 * which holds each kind to ready to fly's own limits (the briefing's hour,
 * the NOTAMs', the AIRAC cycle for the airport cards and plates), so no
 * age is judged here. A caution at most: the answer is shown either way
 * (the owner, 2026-10-23: warn, never limit).
 */
export type KeptKind = EngineInput<"kept_age">["kind"];
export type KeptAge = EngineAnswer<"kept_age">;

/** Every kind, in the order Ready to fly lists them. */
export const KEPT_KINDS: readonly KeptKind[] = ["briefing", "weather", "notams", "airports", "plates", "plan", "go_no_go", "weather_loop"];

/** The engine's age of an answer the network gave at `atMs`; null where
 *  the time is not known. */
export function keptAge(kind: KeptKind, atMs: number | null | undefined, nowMs: number): KeptAge | null {
  if (atMs == null || !Number.isFinite(atMs) || atMs <= 0) return null;
  try {
    return callEngine("kept_age", { now: Math.floor(nowMs / 1000), fetched_at: Math.floor(atMs / 1000), kind });
  } catch {
    return null;
  }
}

/**
 * The age to show of an answer on the page, or null while it is a fresh
 * one from the network. Shown when the answer is a kept one: the service
 * worker gave it from its cache (lib/fromCache, by the address's path,
 * holding when the network gave it), the browser is offline, or the last
 * ask failed and the page kept what it had (`failed`). `atMs` is when the
 * page got it, for a kept answer the worker did not mark (one this device
 * stored itself: the NOTAMs).
 */
export function useKeptAge(kind: KeptKind, { path, atMs, failed = false }: { path?: string; atMs: number | null; failed?: boolean }) {
  const now = useMinuteClock();
  const online = useOnline();
  const savedAt = useSaved((s) => (path ? s.saved[path] : undefined));
  const fromCache = savedAt !== undefined;
  if (!fromCache && online && !failed) return null;
  return keptAge(kind, fromCache && Number.isFinite(savedAt) ? savedAt : atMs, now);
}
