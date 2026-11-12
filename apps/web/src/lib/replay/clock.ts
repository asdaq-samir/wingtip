import { create } from "zustand";
import type { PastFlightPoint } from "../api/types";
import { prefersReducedMotion } from "../motion";

/**
 * The map's one replay clock, which every replay plays on -- a tracked
 * airplane's past flight, the planned flight's dry run, the Studio's
 * tracks (features/replay) -- and the map's airplane (ReplayGl), the
 * pilot's view and the replay's cameras read. Ground every feature stands
 * on, so here in lib/; features/plan/map/pastFlight names it as it always
 * did.
 *
 * A past flight of a tracked airplane, picked from its card's Past
 * flights (FlightCard), as FlightAware shows one: its path on the map in
 * its heights' colours (TracksGl's PastFlightGl), its track log,
 * and its replay -- the airplane flown along it again at 10, 50 or 200
 * times, from where the pilot left it.
 */
/** A report a replay plays: a past flight's, the dry run's, or a
 *  recorded flight made ready by the engine (features/replay's track),
 *  which marks the report after a gap -- nothing known between it and the
 *  last, so nothing is drawn there -- and works out the climb. */
export type ReplayPoint = PastFlightPoint & { gap?: boolean; vs_fpm?: number | null };

interface PastFlightState {
  hex: string | null;
  id: number | null;
  points: ReplayPoint[];
  /** The replay's moment, s since 1970; null before it has been played. */
  at: number | null;
  playing: boolean;
  speed: number;
  /** Where the replay may stand under Reduce Motion, s: the dry run's
   *  points (its rows' times), so the airplane steps leg by leg rather
   *  than gliding (docs/design/web.md §11). None for a past flight, which
   *  glides as it was flown. */
  stops: number[];
}

/** The replay's airplane where it is the planned flight's dry run (FPL's),
 *  not a tracked airplane's past flight. */
export const DRY_RUN = "dry-run";

/** How many times faster than it was flown a replay goes. */
export const REPLAY_SPEEDS = [10, 50, 200] as const;

export const usePastFlight = create<PastFlightState>(() => ({
  hex: null,
  id: null,
  points: [],
  at: null,
  playing: false,
  speed: 50,
  stops: [],
}));

/** A past flight picked: its path drawn once its points are here. */
export function choosePastFlight(hex: string, id: number) {
  usePastFlight.setState((s) => (s.hex === hex && s.id === id ? {} : { hex, id, points: [], at: null, playing: false, stops: [] }));
}

export function clearPastFlight() {
  glide = null;
  usePastFlight.setState({ hex: null, id: null, points: [], at: null, playing: false, stops: [] });
}

/** Played from where it was left, or from the start once it has ended. */
export function playPastFlight() {
  usePastFlight.setState((s) => {
    const first = s.points[0]?.t ?? null,
      last = s.points.at(-1)?.t ?? null;
    if (first === null || last === null) return {};
    return { playing: true, at: s.at === null || s.at >= last ? first : s.at };
  });
}

export function pausePastFlight() {
  usePastFlight.setState({ playing: false });
}

/** Back to before it was played: the airplane off the map. */
export function stopPastFlight() {
  usePastFlight.setState({ playing: false, at: null });
}

/** The run's own clock under Reduce Motion, where the moment shown (`at`)
 *  waits at the last stop passed; null while it glides. */
let glide: number | null = null;

/** Where the airplane is shown at `clock` under Reduce Motion: the last of
 *  `stops` it has reached, the end once there, the clock itself before the
 *  first stop. */
export function legStep(clock: number, stops: number[], last: number): number {
  if (clock >= last) return last;
  let at = clock;
  for (const stop of stops) {
    if (stop > clock) break;
    at = stop;
  }
  return at;
}

/** The replay `ms` of the phone's time on, at its speed; stopped at the
 *  end. Under Reduce Motion, with stops, it goes leg by leg: the clock
 *  runs on unseen and the airplane jumps from one point to the next. */
export function stepPastFlight(ms: number, reduced = prefersReducedMotion()) {
  usePastFlight.setState((s) => {
    const last = s.points.at(-1)?.t;
    if (!s.playing || s.at === null || last === undefined) {
      glide = null;
      return {};
    }
    // A scrub since the last step (the moment no longer the clock's stop)
    // starts the clock again from where it was put.
    const from = glide !== null && legStep(glide, s.stops, last) === s.at ? glide : s.at;
    const clock = Math.min(last, from + (ms / 1000) * s.speed);
    if (!reduced || !s.stops.length) {
      glide = null;
      return { at: clock, playing: clock < last };
    }
    glide = clock;
    const at = legStep(clock, s.stops, last);
    if (at === s.at && clock < last) return {};
    return { at, playing: clock < last };
  });
}

/**
 * Where the airplane was at `t`, between the reports either side of it:
 * its position and height in proportion, its track, speed and climb the
 * earlier report's. Null outside the flight, and inside a gap: where no
 * report was heard it is not known, and is not drawn as if it were.
 */
export function positionAt(points: ReplayPoint[], t: number): ReplayPoint | null {
  if (!points.length || t < points[0]!.t || t > points.at(-1)!.t) return null;
  let lo = 0,
    hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!,
    b = points[hi]!;
  if (b.gap && t > a.t && t < b.t) return null;
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const alt = a.alt_ft != null && b.alt_ft != null ? a.alt_ft + (b.alt_ft - a.alt_ft) * f : (a.alt_ft ?? null);
  return { ...a, t, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, alt_ft: alt };
}
