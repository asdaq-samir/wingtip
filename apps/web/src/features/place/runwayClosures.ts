import { callEngine } from "../../lib/engine/engine";
import { FT_PER_NM } from "../../lib/geo";

/** A strip as the sketch has placed it: its ends in the box's points, its
 *  drawn width, and what closes it. */
type Placed = {
  ends: [string, string];
  ax: number;
  ay: number;
  bx: number;
  by: number;
  width: number;
  permanent: boolean;
  notams: string[];
};

/** One runway's crosses and closed parts, as the sketch draws them. */
export type ClosureMarks = {
  /** Closed end to end. */
  whole: boolean;
  /** The parts closed, fractions of the way from its first end. */
  parts: [number, number][];
  /** Each X's centre, in the box's points. */
  marks: [number, number][];
};

/** An X's half size, points: just over the strip's own half width, so it
 *  reads across the runway it is drawn on. */
export const markHalf = (width: number) => Math.max(4, width / 2 + 1.5);

/** An X's stroke, points. */
export const MARK_STROKE = 2.5;

/**
 * Where each runway's crosses go, as the engine answers it
 * (runway_closure_marks: AC 150/5340-1M 5.6 and 5.7, AIM 2-3-6): an X at
 * each end of a runway a NOTAM closes, and every 1,000 ft and each side
 * of an open runway it crosses for one closed for good, never on an open
 * runway; a part a NOTAM closes, at its own ends. The sketch's points are
 * asked as feet at its scale (`scale` points a nautical mile), so the
 * room an X keeps off an open runway is the room it takes as drawn. None
 * asked where nothing is closed.
 */
export function closureMarksOf(strips: Placed[], scale: number): ClosureMarks[] {
  const none = strips.map(() => ({ whole: false, parts: [], marks: [] }));
  if (!strips.some((s) => s.permanent || s.notams.length) || scale <= 0) return none;
  // Points to feet, the box's y down to north up.
  const feet = (x: number, y: number): [number, number] => [(x / scale) * FT_PER_NM, (-y / scale) * FT_PER_NM];
  // The widest X's reach, its stroke's half (MARK_STROKE) and a point of
  // air with it, so an X kept off an open runway does not touch it.
  const reach = markHalf(Math.max(...strips.map((s) => s.width))) + MARK_STROKE / 2 + 1;
  const { runways } = callEngine("runway_closure_marks", {
    mark_ft: (reach / scale) * FT_PER_NM,
    runways: strips.map((s) => ({
      ends: s.ends,
      a: feet(s.ax, s.ay),
      b: feet(s.bx, s.by),
      width_ft: (s.width / scale) * FT_PER_NM,
      permanent: s.permanent,
      notams: s.notams,
    })),
  });
  return strips.map((s, i) => {
    const r = runways[i];
    if (!r) return none[i]!;
    const parts = r.closed.map(([from, to]) => [from, to] as [number, number]);
    return {
      whole: parts.some(([from, to]) => from <= 0 && to >= 1),
      parts,
      marks: r.marks.map((f) => [s.ax + (s.bx - s.ax) * f, s.ay + (s.by - s.ay) * f] as [number, number]),
    };
  });
}
