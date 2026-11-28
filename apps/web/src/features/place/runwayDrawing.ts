import type { Runway } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";

interface Strip {
  /** Its two ends, in nautical miles east and north of the field. */
  a: [number, number];
  b: [number, number];
  width_ft: number;
  ends: [string, string];
  closed: boolean;
  /** Closed for good (NASR's remark), and the NOTAMs in force on it: what
   *  the engine places its Xs by (runwayClosures). */
  permanent: boolean;
  notams: string[];
  /** Its turf, as fractions of the way from `a` to `b`. */
  turf: [number, number][];
}

/** A runway as the sketch takes it: the place's, or the card's with its
 *  NOTAMs (runwayPicks' withNotamClosures). */
export type SketchRunway = Runway & { closedForGood?: boolean; notams?: string[] };

/** A runway of turf or grass alone, as OurAirports writes its surface
 *  ("TURF", "TURF-G", "GRS", "GRASS / SOD"); one of two surfaces
 *  ("ASPH-TURF") is turf only where the FAA's remarks say (`turf`). */
const TURF_SURFACE = /^(TURF|GRS|GRASS|SOD)\b/i;

/** The runway's turf as fractions of the way from its first end to its
 *  second: all of it for a runway of turf, else each part the planner
 *  read from the remarks, measured from whichever end it names. None
 *  without the runway's length to measure by. */
function turfOf(r: Runway, ends: [string, string]): [number, number][] {
  if (r.surface && TURF_SURFACE.test(r.surface)) return [[0, 1]];
  const length = r.length_ft;
  if (!length) return [];
  return (r.turf ?? []).flatMap((part) => {
    const from = Math.min(1, part.from_ft / length),
      to = Math.min(1, (part.to_ft ?? length) / length);
    if (part.end === ends[0]) return [[from, to] as [number, number]];
    if (part.end === ends[1]) return [[1 - to, 1 - from] as [number, number]];
    return [];
  });
}

/**
 * Each runway as a strip in nautical miles about the field, as the engine
 * lays it (runway_sketch: between its NASR-surveyed ends, else guessed
 * along its first end's true heading through the field's point where no
 * runway has its ends, one of a field's parallels; NASR's width, else the
 * drawing's own), with what closes it and its turf; and how many runways
 * with two ends the sketch leaves out, so the card can say its picture is
 * partial rather than whole. None for a helipad.
 */
export function sketchOf(runways: SketchRunway[], lat: number, lon: number): { strips: Strip[]; leftOut: number } {
  if (!runways.length) return { strips: [], leftOut: 0 };
  const { strips, left_out } = callEngine("runway_sketch", { lat, lon, runways });
  return {
    leftOut: left_out,
    strips: strips.flatMap((s) => {
      const r = runways[s.runway];
      const [first, second] = r?.runway_ends ?? [];
      if (!r || !first || !second) return [];
      const ends: [string, string] = [first.ident, second.ident];
      return [
        {
          a: [s.a[0]!, s.a[1]!],
          b: [s.b[0]!, s.b[1]!],
          width_ft: s.width_ft,
          ends,
          closed: r.closed,
          permanent: r.closedForGood ?? r.closed,
          notams: r.notams ?? [],
          turf: turfOf(r, ends),
        },
      ];
    }),
  };
}

/** Half a runway number's width in its bold digits, about 0.62 of its
 *  size a character, and a point of air. */
export function numberHalfWidth(characters: number, size: number): number {
  return (characters * 0.62 * size) / 2 + 1;
}

/**
 * Where each end's number is written: just past its end along the
 * runway, or a little further out where a number already written is
 * there -- a field of close parallels (O'Hare's 09C and 09R) set its
 * numbers on one another -- the longest runways' first. A number with no
 * clear place near its end is left off, rather than written over another
 * or out where it reads as no runway's. `blocked` says a box (centre and
 * half sizes) lies under a pane laid over the sketch: no number is written
 * there, whichever of its places it is.
 */
export function numbersOf(
  strips: { ends: [string, string]; closed: boolean; ax: number; ay: number; bx: number; by: number; ux: number; uy: number }[],
  size: number,
  gap: number,
  w: number,
  h: number,
  blocked: (x: number, y: number, hw: number, hh: number) => boolean = () => false,
) {
  const taken: { x: number; y: number; hw: number; hh: number }[] = [];
  const written: { end: string; key: string; x: number; y: number; closed: boolean }[] = [];
  const byLength = [...strips].sort((p, q) => Math.hypot(q.bx - q.ax, q.by - q.ay) - Math.hypot(p.bx - p.ax, p.by - p.ay));
  for (const s of byLength) {
    s.ends.forEach((end, i) => {
      // Outward from this end: back along the runway from its first end,
      // on from its second.
      const [ex, ey, dx, dy] = i === 0 ? [s.ax, s.ay, -s.ux, -s.uy] : [s.bx, s.by, s.ux, s.uy];
      const hw = numberHalfWidth(end.length, size),
        hh = size / 2;
      for (const out of [gap, gap + size * 1.2]) {
        const x = ex + dx * out,
          y = ey + dy * out;
        const inBox = x - hw >= 0 && x + hw <= w && y - hh >= 0 && y + hh <= h;
        if (!inBox || blocked(x, y, hw, hh) || taken.some((t) => Math.abs(t.x - x) < t.hw + hw && Math.abs(t.y - y) < t.hh + hh)) continue;
        taken.push({ x, y, hw, hh });
        written.push({ end, key: `${s.ends.join("/")}-${end}`, x, y, closed: s.closed });
        return;
      }
    });
  }
  return written;
}
