import { callEngine } from "../../lib/engine/engine";
import type { ReplayGap, ReplayReport, ReplaySample } from "../../lib/engine/contract";
import { positionAt } from "../../lib/replay/clock";

/** What an altitude in a track is: the transponder's pressure altitude
 *  (adsb.lol's), as heard here (GNSS or set on the nearest altimeter), or
 *  a file's GPS height above sea level. The data block says which. */
export type AltitudeKind = "pressure" | "reported" | "gps";

/**
 * A recorded flight ready to replay, the one model every replay plays --
 * the Studio's tracks, and in time Plan's past flights (features/replay's
 * TODO in PastFlightCard) -- as a time series of position, altitude,
 * ground speed, vertical speed and heading. The engine makes it ready
 * (replay_track): its gaps marked, nothing smoothed over them, the climb
 * worked out. The clock it plays on is the map's one replay clock
 * (usePastFlight), so the map's airplane, the 3D cameras and the profile
 * all read the same moment.
 */
export interface ReplayTrack {
  /** Unique among tracks: the source and what it is of. */
  id: string;
  /** What it is of, for the title: "N14511 · Nov 10". */
  label: string;
  points: ReplaySample[];
  gaps: ReplayGap[];
  lengthNm: number;
  altitude: AltitudeKind;
  /** Where it came from, said beside the replay (ODbL 1.0 asks it of
   *  adsb.lol's data): "adsb.lol, ODbL 1.0"; null for the pilot's own file. */
  credit: string | null;
}

/** The reports made ready (the engine's replay_track). */
export function readyTrack(
  reports: ReplayReport[],
  meta: { id: string; label: string; altitude: AltitudeKind; credit: string | null },
): ReplayTrack {
  const ready = callEngine("replay_track", { points: reports });
  return { ...meta, points: ready.points, gaps: ready.gaps, lengthNm: ready.length_nm };
}

/** The gap `t` falls in, or null: the replay says "No reports" there
 *  rather than drawing the airplane where it is not known to have been. */
export function gapAt(track: Pick<ReplayTrack, "gaps">, t: number): ReplayGap | null {
  return track.gaps.find((g) => t > g.from && t < g.to) ?? null;
}

/** The airplane at `t`: between the reports either side in proportion
 *  (positionAt, the map's own), with the climb the earlier report's; null
 *  outside the flight or in a gap. Every frame, so here and not in the
 *  engine (engine/crates/route/src/motion's note). */
export function sampleAt(points: ReplaySample[], t: number): ReplaySample | null {
  return positionAt(points, t) as ReplaySample | null;
}

/** How far along the flight `t` is, nm, for the profile's mark. */
export function alongAt(points: ReplaySample[], t: number): number | null {
  const here = sampleAt(points, t);
  if (!here) return null;
  const i = points.findIndex((p) => p.t >= t);
  if (i <= 0) return points[0]?.along_nm ?? null;
  const a = points[i - 1]!,
    b = points[i]!;
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return a.along_nm + (b.along_nm - a.along_nm) * f;
}
