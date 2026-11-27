import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TEXT, TEXT_POINTS } from "../../lib/text";
import { FT_PER_NM } from "../../lib/geo";
import { numberHalfWidth, numbersOf, sketchOf, type SketchRunway } from "./runwayDrawing";
import { closureMarksOf, MARK_STROKE, markHalf } from "./runwayClosures";
import { CHART } from "../../lib/tokens";

/** Round the runways, in the box's own points: the strips' half width and
 *  a little air. */
const MARGIN = 8;

/** Turf, green as the grass it is, at the pilot's ask: a shade that
 *  reads beside the paved strips' ink on the card's glass in either
 *  scheme. */
const TURF = CHART.runwaySoft;

/** What of a runway is not its turf, as fractions of it from end to end. */
/** The line along a runway from `from` to `to` (fractions of its length),
 *  each end drawn in by `inset` px. */
function along(s: { ax: number; ay: number; bx: number; by: number; ux: number; uy: number }, from: number, to: number, inset = 0) {
  return {
    x1: s.ax + (s.bx - s.ax) * from + s.ux * inset,
    y1: s.ay + (s.by - s.ay) * from + s.uy * inset,
    x2: s.ax + (s.bx - s.ax) * to - s.ux * inset,
    y2: s.ay + (s.by - s.ay) * to - s.uy * inset,
  };
}

function pavedOf(turf: [number, number][]): [number, number][] {
  const paved: [number, number][] = [];
  let at = 0;
  for (const [from, to] of [...turf].sort((a, b) => a[0] - b[0])) {
    if (from > at) paved.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < 1) paved.push([at, 1]);
  return paved;
}

/**
 * A sketch of the field's runways, north up and to scale, as a diagram
 * draws them -- dark strips with a dashed centre line, green where they
 * are turf -- and each end's number just past it, upright, at the
 * pilot's ask: they were left off once for the room they took in the
 * card's box, and the box gives that room now, the runways a little
 * shorter for it. Drawn in the box's own points, whatever its shape, so
 * the field fills it. Nothing where no runway can be drawn.
 */
export function RunwaySketch({
  runways,
  lat,
  lon,
  numbers = "caption",
  onWritten,
}: {
  runways: SketchRunway[];
  lat: number;
  lon: number;
  /** The ends' numbers' type role: a caption (iOS's Caption 2) in the
   *  card's box, a row's full screen (SketchViewer). Its class sets their
   *  size and leading as every other text's (lib/text), its points
   *  (TEXT_POINTS) the room the sketch leaves them. */
  numbers?: keyof typeof TEXT_POINTS;
  /** The numbers written, in the order drawn, one space between: the
   *  words in sight, for the name of the button round the sketch (WCAG
   *  2.5.3, Label in Name). Some ends find no room and are not written. */
  onWritten?: (words: string) => void;
}) {
  const numberSize = TEXT_POINTS[numbers];
  const box = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const parent = box.current?.parentElement;
    if (!parent) return;
    const measure = () => setSize({ w: parent.clientWidth, h: parent.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const drawn = useMemo(() => {
    const { strips } = sketchOf(runways, lat, lon);
    if (!strips.length || !size || size.w < 2 * MARGIN || size.h < 2 * MARGIN) return null;
    const { w, h } = size;
    const xs = strips.flatMap((s) => [s.a[0], s.b[0]]),
      ys = strips.flatMap((s) => [s.a[1], s.b[1]]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Each end's number, its middle this far past the end along the
    // runway: clear of the strip whichever way it runs.
    const gap = numberSize * 0.9 + 2;
    // Nautical miles to points, the same both ways (to scale), the whole
    // field inside the margin and the numbers past its ends inside the
    // box, and off its edge: the widest number's half past the gap, and
    // half the margin's air.
    const widest = Math.max(...strips.flatMap((s) => s.ends.map((e) => e.length)));
    const margin = gap + numberHalfWidth(widest, numberSize) + MARGIN / 2;
    const fit = Math.min((w - 2 * margin) / Math.max(maxX - minX, 1e-3), (h - 2 * margin) / Math.max(maxY - minY, 1e-3));
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    const atScale =
      (k: number) =>
      ([x, y]: [number, number]): [number, number] => [w / 2 + (x - cx) * k, h / 2 - (y - cy) * k];
    const place = (k: number) =>
      strips.map((s) => {
        const to = atScale(k);
        const [ax, ay] = to(s.a),
          [bx, by] = to(s.b);
        const length = Math.hypot(bx - ax, by - ay) || 1;
        const [ux, uy] = [(bx - ax) / length, (by - ay) / length];
        const na: [number, number] = [ax - ux * gap, ay - uy * gap],
          nb: [number, number] = [bx + ux * gap, by + uy * gap];
        return { ax, ay, bx, by, ux, uy, na, nb };
      });
    const scale = fit;
    const placed = place(scale).map((p, i) => {
      const s = strips[i]!;
      // Wide enough to read at this size, whatever the field's scale.
      const width = Math.max(4, Math.min(10, (s.width_ft / FT_PER_NM) * scale * 3));
      return { ...s, ...p, width };
    });
    // Each runway's closed parts and crosses, the engine's (runwayClosures).
    const closures = closureMarksOf(placed, scale);
    const marked = placed.map((p, i) => ({ ...p, closed: p.closed || closures[i]!.whole, closure: closures[i]! }));
    return { w, h, strips: marked, numbers: numbersOf(marked, numberSize, gap, w, h) };
  }, [runways, lat, lon, size, numberSize]);
  const written = drawn?.numbers.map((n) => n.end).join(" ") ?? "";
  useEffect(() => onWritten?.(written), [onWritten, written]);
  return (
    <svg
      // Out of the flow, the box's size its own: an SVG's own default
      // size (150 tall) made the box that tall.
      ref={box}
      viewBox={drawn ? `0 0 ${drawn.w} ${drawn.h}` : undefined}
      className="absolute inset-0 size-full"
      aria-hidden="true"
      data-testid="runway-sketch"
    >
      {drawn?.strips.map((s) => (
        <g key={s.ends.join("/")} opacity={s.closed ? 0.35 : 1}>
          <line x1={s.ax} y1={s.ay} x2={s.bx} y2={s.by} stroke="currentColor" strokeWidth={s.width} />
          {/* Its turf over the paving, the part the remarks say (C81's
              south-west 1,000 ft), or all of a turf runway. */}
          {s.turf.map(([from, to]) => (
            <line key={`${from}-${to}`} data-turf="" {...along(s, from, to)} stroke={TURF} strokeWidth={s.width} />
          ))}
          {/* A dotted line of light down the turf, so it is told from
              paving by its texture and not by its green alone. */}
          {s.turf.map(([from, to]) => (
            <line
              key={`dots-${from}-${to}`}
              {...along(s, from, to)}
              stroke="white"
              strokeOpacity={0.7}
              strokeWidth={Math.max(1, s.width / 4)}
              strokeDasharray="1 3"
              strokeLinecap="round"
            />
          ))}
          {/* The centre line on the paving alone: grass has none painted. */}
          {pavedOf(s.turf).map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              {...along(s, from, to, 3)}
              className="stroke-background"
              strokeWidth={0.9}
              strokeDasharray="3.5 3"
            />
          ))}
          {/* A part a NOTAM closes, faded as a closed runway is. */}
          {!s.closed &&
            s.closure.parts.map(([from, to]) => (
              <line
                key={`closed-${from}-${to}`}
                data-closed-part={s.ends.join("/")}
                {...along(s, from, to)}
                className="stroke-background"
                strokeOpacity={0.65}
                strokeWidth={s.width + 1}
              />
            ))}
        </g>
      ))}
      {/* A closed runway crossed out where the airport marks it on the
          ground (AC 150/5340-1M 5.6 and 5.7, AIM 2-3-6; the engine's
          runway_closure_marks): an X at each end, and for one closed for
          good every 1,000 ft and each side of an open runway it crosses,
          never on an open one. Each X square to its runway and just wider
          than it, in the red of the Runways tab's Closed badge (the FAA
          paints them yellow, Figure A-27; faded alone a closed runway
          read as open, UI audit A5, 2026-11-17). */}
      {drawn?.strips.flatMap((s) =>
        s.closure.marks.map(([x, y], k) => {
          const m = markHalf(s.width);
          // Along the runway and across it, an arm each way between them.
          const [ax, ay] = [s.ux * m, s.uy * m],
            [cx, cy] = [-s.uy * m, s.ux * m];
          return (
            <path
              key={`${s.ends.join("/")}-x-${k}`}
              data-closed-runway={s.ends.join("/")}
              d={`M${x - ax - cx} ${y - ay - cy}L${x + ax + cx} ${y + ay + cy}M${x - ax + cx} ${y - ay + cy}L${x + ax - cx} ${y + ay - cy}`}
              className="stroke-destructive"
              strokeWidth={MARK_STROKE}
              strokeLinecap="round"
            />
          );
        }),
      )}
      {/* Each end's number past it, upright, over every strip, in the
          strips' ink with a casing of the box's ground so a crossing
          runway does not cut through it. A space between each, which an
          SVG draws nothing of outside a <text>, so the words read in sight
          are "09 27", not "0927", for the name round them (onWritten). */}
      {drawn?.numbers.map((n, i) => (
        <Fragment key={n.key}>
          {i > 0 && " "}
          <text
            x={n.x}
            y={n.y}
            textAnchor="middle"
            dominantBaseline="central"
            data-runway-end={n.end}
            fontWeight={700}
            fill="currentColor"
            opacity={n.closed ? 0.35 : 1}
            className={`stroke-background ${TEXT[numbers]}`}
            strokeWidth={3}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {n.end}
          </text>
        </Fragment>
      ))}
    </svg>
  );
}
