import { altFt, grouped } from "../../lib/format";
import { replayTimes } from "./replayTime";
import { gapAt, sampleAt, type AltitudeKind, type ReplayTrack } from "./track";

/** What the altitude figure is, said beside it: a transponder's
 *  pressure altitude is not what an altimeter set to the local setting
 *  read (AIM 7-2-2), nor is a GPS's height. */
const ALT_NAME: Record<AltitudeKind, string> = { pressure: "Press alt", reported: "Altitude", gps: "GPS alt" };

/** The figures of a moment: each rounded as a data block rounds it. */
function figures(track: ReplayTrack, t: number) {
  const here = sampleAt(track.points, t);
  if (!here) return null;
  const vs = here.vs_fpm;
  return {
    alt: here.ground ? "Ground" : `${altFt(here.alt_ft == null ? null : Math.round(here.alt_ft / 10) * 10)} ft`,
    gs: here.gs_kt == null ? "—" : `${Math.round(here.gs_kt)} kt`,
    // To the 50 ft/min a VSI's needle is read to; level within it.
    vs: vs == null ? "—" : Math.abs(vs) < 50 ? "Level" : `${vs > 0 ? "+" : "−"}${grouped(Math.round(Math.abs(vs) / 50) * 50)} fpm`,
    trk: here.track_deg == null ? "—" : `${String(Math.round(here.track_deg) % 360 || 360).padStart(3, "0")}°`,
  };
}

/** The data block's lines at `t`: the time in Zulu, and the figures
 *  (name, value, test id), or the gap it falls in said instead. The
 *  screen's block and a video's (export/drawOverlay) both draw these. */
export function blockOf(track: ReplayTrack, t: number): { time: string; gap: string | null; rows: [string, string, string][] } {
  const gap = gapAt(track, t);
  const shown = gap ? null : figures(track, t);
  const rows: [string, string, string][] = shown
    ? [
        [ALT_NAME[track.altitude], shown.alt, "alt"],
        ["GS", shown.gs, "gs"],
        ["VS", shown.vs, "vs"],
        ["TRK", shown.trk, "trk"],
      ]
    : [];
  return { time: replayTimes(t).zulu, gap: gap ? `No reports ${replayTimes(gap.from).zulu}–${replayTimes(gap.to).zulu}` : null, rows };
}
