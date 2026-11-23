import { memo, useState, type PointerEvent } from "react";
import { cn } from "cn";
import type { Stroke } from "./padStore";
import { draws, pressureOf, strokePath } from "./ink";

/** The page drawn in units of its own, a thousand across and a
 *  kneeboard's shape, taller than wide: the SVG scales them to the page
 *  as it is laid out, so a stroke kept at one width draws at any. */
const ACROSS = 1000;
const DOWN = 1333;
/** A stroke's width in those units: about 2.5 points on an iPhone's
 *  page, 4 on an iPad's. */
const NIB = 6;

/** The strokes already made, drawn again only when they change. Each is
 *  perfect-freehand's outline worked out afresh, and drawn beside the live
 *  stroke every pointer move (and every letter typed in a box above) took
 *  every stroke on the page through it again: hundreds of outlines a move
 *  on a page of notes. */
const KeptInk = memo(function KeptInk({ strokes }: { strokes: Stroke[] }) {
  return strokes.map((s, i) => <path key={i} d={strokePath(s, ACROSS, NIB)} fill="currentColor" />);
});

/**
 * The scratchpad's ink: an Apple Pencil, a finger or a mouse writes on
 * it, and once a pen has written a palm or a finger resting on the glass
 * does not (ink's `draws`). Each stroke is drawn as it is made and handed
 * on (`onStroke`) as it ends, in fractions of the page's width so it
 * draws the same at any width. Pointer Events, captured, so a stroke
 * that leaves the page still ends; the page takes no scroll or zoom from
 * a pointer (touch-action: none), the boxes above it scroll the page.
 */
export function InkPad({ strokes, onStroke, label }: { strokes: Stroke[]; onStroke: (stroke: Stroke) => void; label: string }) {
  const [penSeen, setPenSeen] = useState(false);
  const [live, setLive] = useState<Stroke | null>(null);
  const at = (e: PointerEvent<SVGSVGElement>): [number, number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width, pressureOf(e.pointerType, e.pressure)];
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!draws(e.pointerType, penSeen, e.isPrimary)) return;
    if (e.pointerType === "pen") setPenSeen(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setLive({ points: [at(e)], pen: e.pointerType === "pen" });
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!live || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const point = at(e);
    setLive((s) => s && { ...s, points: [...s.points, point] });
  };
  const up = () => {
    if (live && live.points.length > 0) onStroke(live);
    setLive(null);
  };
  return (
    <svg
      viewBox={`0 0 ${ACROSS} ${DOWN}`}
      role="img"
      aria-label={label}
      data-testid="scratchpad-ink"
      data-strokes={strokes.length}
      className={cn("block h-auto w-full touch-none rounded-xl bg-background text-foreground ring-1 ring-border select-none")}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setLive(null)}
    >
      <KeptInk strokes={strokes} />
      {live && <path d={strokePath(live, ACROSS, NIB)} fill="currentColor" />}
    </svg>
  );
}
