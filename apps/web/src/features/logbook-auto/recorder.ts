import { keptStore, wasKept } from "../../lib/storage";
import type { Fix } from "../../lib/map/ownShip";

/** A point of the recorded track as the engine reads one (TrackPoint):
 *  ms since 1970, GPS altitude in feet MSL where the phone gave one. */
export interface RecordedPoint {
  t: number;
  lat: number;
  lon: number;
  alt_ft: number | null;
}

/**
 * The flight the phone's own GPS records while own ship is on (not a dry
 * run's), kept in this browser until it is logged or let go: what the
 * engine draws the logbook entry from (logbook_from_track). Nothing of
 * it leaves the device until the pilot confirms the entry, and then only
 * to the planner for the draft and, where they link a saved flight, to
 * that flight's debrief.
 *
 * `askedTo` is the end of the flight time (the engine's block.to) last
 * offered as a draft, so a draft let go is not offered again until a
 * later landing ends another.
 */
interface Recorded {
  points: RecordedPoint[];
  askedTo: number | null;
}

const KEY = "wingtip.autolog.track";
export const recorded = keptStore<Recorded>(KEY, { points: [], askedTo: null });

/** A point every 5 s: four hours are under 3,000 points, a light
 *  airplane's track keeps its shape (the engine's ground speeds read ten
 *  seconds round each point), and the gateway's 5,000 is never reached. */
export const EVERY_MS = 5_000;
/** The most points kept: the planner takes 5,000 at most. */
export const MOST_POINTS = 5_000;

/** A fix from own ship into the recorded track, at most one per EVERY_MS;
 *  false where the browser would not keep it (private window, full). */
export function record(fix: Fix): boolean {
  const { points } = recorded.getState().value;
  const last = points.at(-1);
  if (last && fix.at - last.t < EVERY_MS) return true;
  if (points.length >= MOST_POINTS) return true;
  const point: RecordedPoint = { t: fix.at, lat: fix.lat, lon: fix.lon, alt_ft: fix.altitudeFt };
  recorded.setState(s => ({ value: { ...s.value, points: [...s.value.points, point] } }));
  return wasKept(KEY);
}

/** The flight ending at `to` offered: not again until a later one. */
export function asked(to: number) {
  recorded.setState(s => ({ value: { ...s.value, askedTo: to } }));
}

/** The track let go: logged, or the pilot does not want it. */
export function forget() {
  recorded.setState({ value: { points: [], askedTo: null } });
}
