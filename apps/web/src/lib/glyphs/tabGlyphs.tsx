import { useId, type ComponentType } from "react";

/** A tab bar's glyph (TabBar): drawn in outline, and filled for the tab
 *  that is up, as iOS's tab bars draw their symbols. */
export type TabGlyph = ComponentType<{ className?: string; filled?: boolean }>;

/**
 * The planner's tab glyphs, drawn for it on one 28-point grid with one
 * 2-point line, round caps and joins, each with a filled face for the
 * tab that is up, as SF Symbols give every symbol a `.fill` -- the
 * owner's ask for crisp, modern graphics (2026-11-04). Each is the
 * thing itself as a pilot knows it: the route with its ends and a fix,
 * the chart's airport symbol -- the circle with its runway -- an
 * airplane from above, and a gear. At 28 points a 2-point line stays
 * on whole pixels at 2x and 3x; the lines meet nothing thinner than the
 * line.
 */
const GRID = { viewBox: "0 0 28 28", "aria-hidden": true as const, focusable: false as const };
const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The route: the departure and the destination as rings, a fix on the
 *  course between them. Up, the ends filled. */
export function RouteGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} {...GRID}>
      <path d="M7.5 20.3L13 14L20.3 7.5" {...LINE} strokeWidth={filled ? 2.5 : 2} />
      <circle cx="5.5" cy="22.5" r="3" {...LINE} fill={filled ? "currentColor" : "none"} />
      <circle cx="22.5" cy="5.5" r="3" {...LINE} fill={filled ? "currentColor" : "none"} />
      <path d="M13 11.3L15.7 14L13 16.7L10.3 14Z" fill="currentColor" />
    </svg>
  );
}

/** The four ticks round a sectional's airport symbol, the sign of a
 *  field with services (FAA Aeronautical Chart User's Guide, Airports). */
const TICKS = "M14 1.8V4.6M14 23.4V26.2M1.8 14H4.6M23.4 14H26.2";

/** The chart's airport with services: a circle, its runway up the
 *  middle and the four ticks round it. The runway drawn across on a
 *  diagonal read as a "prohibited" sign (the UI audit, 2026-11-09). Up,
 *  the disc with the runway cut out of it. */
export function AirportGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  const id = useId();
  if (!filled) {
    return (
      <svg className={className} {...GRID}>
        <circle cx="14" cy="14" r="8.6" {...LINE} />
        <path d="M14 9.4V18.6" {...LINE} strokeWidth={3.2} />
        <path d={TICKS} {...LINE} />
      </svg>
    );
  }
  return (
    <svg className={className} {...GRID}>
      <mask id={id}>
        <rect width="28" height="28" fill="white" />
        <path d="M14 8.8V19.2" stroke="black" strokeWidth={3.2} strokeLinecap="round" />
      </mask>
      <circle cx="14" cy="14" r="9.6" fill="currentColor" mask={`url(#${id})`} />
      <path d={TICKS} {...LINE} />
    </svg>
  );
}

/** An airplane from above, its nose up. */
const AIRPLANE =
  "M14 2.6c1.3 0 2.1 1.2 2.1 3v6.2l9.2 5.5v2.6l-9.2-2.9v4.6l2.8 2.1v2l-4.9-1.4-4.9 1.4v-2l2.8-2.1v-4.6l-9.2 2.9v-2.6l9.2-5.5V5.6c0-1.8.8-3 2.1-3z";
export function AirplaneGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} {...GRID}>
      <path d={AIRPLANE} {...LINE} fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

/** A gear, eight teeth. */
const GEAR =
  "M11.8 4.6L12.5 1.7L15.5 1.7L16.2 4.6L19.1 5.9L21.6 4.2L23.8 6.4L22.1 8.9L23.4 11.8L26.3 12.5L26.3 15.5L23.4 16.2L22.1 19.1L23.8 21.6L21.6 23.8L19.1 22.1L16.2 23.4L15.5 26.3L12.5 26.3L11.8 23.4L8.9 22.1L6.4 23.8L4.2 21.6L5.9 19.1L4.6 16.2L1.7 15.5L1.7 12.5L4.6 11.8L5.9 8.9L4.2 6.4L6.4 4.2L8.9 5.9Z";
const HOLE = "M14 10.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z";
export function GearGlyph({ className, filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} {...GRID}>
      {filled ? (
        <path d={`${GEAR}${HOLE}`} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <path d={GEAR} {...LINE} />
          <path d={HOLE} {...LINE} />
        </>
      )}
    </svg>
  );
}
