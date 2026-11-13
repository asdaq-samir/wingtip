import { callEngine } from "../../engine/engine";
import type { SimGround, SimRow, SimSample, SimSegment, SimSetting } from "../../engine/contract";

export type { SimRow, SimSegment };

/**
 * A recorded flight as a flight simulator's export wants it, the one
 * source every file writer here reads (fdr, skyDolly, kml, gpx): the
 * engine's sim_flight makes the frames -- a smooth path between the
 * reports, the altitude above sea level where the airplane sent its
 * altimeter setting, and the attitude, gear, flaps and lights estimated --
 * and the writers only put them in each format's words. Plain data, so
 * the Studio and Plan's past flights (features/replay) both hand it in.
 */
export interface SimSource {
  /** The track made ready (replay_track's points). */
  points: SimSample[];
  /** The altimeter settings the airplane sent, with its pressure altitude then. */
  settings: SimSetting[];
  /** The ground under the track, ft MSL, by how far along it. */
  ground: SimGround[];
  /** Whether the altitudes are pressure altitude (adsb.lol's) rather than above sea level. */
  pressure: boolean;
}

/** What the files say the flight is. */
export interface SimMeta {
  /** For the file's title: "N14511 · Nov 10". */
  title: string;
  /** The registration, the simulator's tail number. */
  tail: string | null;
  /** The ICAO type designator ("A21N"), where known. */
  icaoType: string | null;
  /** The maker and model, as the FAA's registry has them. */
  model: string | null;
  /** Where the reports came from, which the file says (ODbL 1.0 asks it of adsb.lol's). */
  credit: string | null;
}

/** Frames a second for the formats a simulator replays row by row
 *  (X-Plane's FDR, Sky Dolly's CSV): ten, the owner's least for a fluid
 *  replay (2026-11-12). */
export const FRAME_HZ = 10;
/** Frames a second for the formats whose reader draws its own path
 *  between points (Google Earth, FlightControlReplay, GPX): one keeps a
 *  whole day's file small, and the engine's curve between the reports is
 *  already in them. */
export const TRACK_HZ = 1;

/** Every segment of the flight, `rateHz` frames a second. */
export function simSegments(source: SimSource, rateHz: number): SimSegment[] {
  return callEngine("sim_flight", { ...source, rate_hz: rateHz }).segments;
}

/** The run of reports (between two gaps) the moment `t` is in, else the
 *  nearest one; the whole first one where `t` is null. Each run is one
 *  file in a format that cannot say "no data here". */
export function runAround(points: SimSample[], t: number | null): { from: number; to: number } | null {
  const runs: { from: number; to: number }[] = [];
  for (const p of points) {
    const last = runs.at(-1);
    if (!last || p.gap) runs.push({ from: p.t, to: p.t });
    else last.to = p.t;
  }
  const real = runs.filter((r) => r.to > r.from);
  if (t === null) return real[0] ?? null;
  const away = (r: { from: number; to: number }) => (t < r.from ? r.from - t : t > r.to ? t - r.to : 0);
  return real.reduce<{ from: number; to: number } | null>((best, r) => (!best || away(r) < away(best) ? r : best), null);
}

/** The one segment around `t` (runAround), `rateHz` frames a second. */
export function simSegmentAround(source: SimSource, t: number | null, rateHz: number): SimSegment | null {
  const run = runAround(source.points, t);
  if (!run) return null;
  return callEngine("sim_flight", { ...source, from: run.from, to: run.to, rate_hz: rateHz }).segments[0] ?? null;
}

/** A Unix time, s, as ISO 8601 UTC to the hundredth: "2026-11-10T01:01:46.05Z". */
export function isoTime(t: number): string {
  return new Date(Math.round(t * 1000)).toISOString().replace(/(\.\d\d)\dZ$/, "$1Z");
}

/** What the files say of the altitude (the engine's sim_flight note). */
export function altitudeWords(segment: Pick<SimSegment, "msl" | "setting_hpa">): string {
  if (segment.setting_hpa !== null)
    return `Altitude: feet above mean sea level, the transponder's pressure altitude set on the airplane's own altimeter setting (${segment.setting_hpa.toFixed(1)} hPa, ${(segment.setting_hpa / 33.86389).toFixed(2)} inHg).`;
  if (segment.msl) return "Altitude: feet above mean sea level, as recorded.";
  return "Altitude: pressure altitude (29.92 inHg), not corrected to sea level: the airplane sent no altimeter setting. On a day off standard it reads about 1,000 ft for each inch of mercury from 29.92.";
}

/** The words every file carries about what is estimated. */
export const ESTIMATED_WORDS =
  "Estimated, not measured (ADS-B sends none of them): heading (the track; the wind is not known), pitch and bank (from the climb and the turn), landing gear, flaps and lights (by phase of flight). Nothing is drawn across a gap in the reports.";

/** A file's name: the tail and the start, "N14511-2026-11-10-0101Z". */
export function fileStem(meta: SimMeta, t: number): string {
  const iso = new Date(t * 1000).toISOString();
  return `${(meta.tail ?? "track").replace(/[^A-Za-z0-9-]/g, "")}-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}
