/**
 * A flown track as a pilot's apps export it -- ForeFlight's, Garmin
 * Pilot's, a GPS's -- read in the browser: GPX's track points, or KML's
 * gx:Track (ForeFlight's track log), each with its time, and its
 * altitude where it has one. GPS altitude, above sea level: not what
 * the altimeter read, and the debrief says so.
 *
 * Nothing here leaves the device: a track is the pilot's, kept in this
 * browser (keepTrack) unless they save it to their account.
 */
import { callEngine } from "./engine/engine";
import { keptStore, wasKept } from "./storage";

export interface TrackPoint {
  /** When, ms since the epoch. */
  t: number;
  lat: number;
  lon: number;
  /** GPS altitude, feet above sea level; null where the file has none. */
  altFt: number | null;
}

/** Something the file is not, in words for the pilot. */
export class TrackError extends Error {}

/** A track file's points in time order, the unreadable ones dropped;
 *  a TrackError where it has none to use. Read by the shared engine
 *  (engine/crates/route/src/motion/track.rs), the phone's reader too: GPX's
 *  trkpt and KML's gx:Track, times in UTC as GPX 1.1 sets them. */
export function readTrack(text: string): TrackPoint[] {
  const read = callEngine("read_track", { text });
  if ("error" in read) throw new TrackError(read.error);
  return read.points.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altFt: p.alt_ft }));
}

/** A track as the engine reads its points: altitude as alt_ft. */
export const enginePoints = (points: TrackPoint[]) => points.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, alt_ft: p.altFt }));

/** A track thinned to at most `most` points, the first and the last
 *  kept: for keeping it, where a second-by-second log of two hours is
 *  seven thousand. Even steps through it, which keep its shape at a
 *  light airplane's speeds (the engine's thin_track). */
export function thin(points: TrackPoint[], most = 4000): TrackPoint[] {
  // The engine hands back the points kept each as it came, which the
  // contract cannot say is a TrackPoint.
  return callEngine("thin_track", { points, most }) as TrackPoint[];
}

type KeptTrack = { source: string; points: TrackPoint[] } | null;
const KEY = (flightId: number) => `wingtip.track.${flightId}`;
const store = (flightId: number) => keptStore<KeptTrack>(KEY(flightId), null);

/** A flight's track as kept in this browser (lib/storage), or null: none
 *  kept, or storage not to be had (a private window). */
export function keptTrack(flightId: number): KeptTrack {
  return store(flightId).getState().value;
}

/** Keeps a flight's track in this browser, or forgets it (null). False
 *  where storage cannot be had or is full. */
export function keepTrack(flightId: number, track: KeptTrack): boolean {
  store(flightId).setState({ value: track });
  return wasKept(KEY(flightId));
}

/** Every flight's track kept in this browser forgotten, as the pilot whose
 *  flights they were signs out (useLogout): each is a line of positions
 *  under one of their flights, which the next person on the device has no
 *  business reading (docs/privacy-inventory.md, the prelaunch audit). */
export function forgetKeptTracks(): void {
  const prefix = KEY(0).slice(0, -1);
  const ids: number[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const id = key?.startsWith(prefix) ? Number(key.slice(prefix.length)) : NaN;
      if (Number.isInteger(id)) ids.push(id);
    }
  } catch {
    return; // storage refused: nothing was kept
  }
  for (const id of ids) keepTrack(id, null);
}
