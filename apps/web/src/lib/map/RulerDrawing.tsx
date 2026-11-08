import { TEXT } from "../text";
import type { Placed } from "./rulerPlaced";

/** How far the map may zoom under two fingers held for the ruler, in
 *  levels: a twentieth is 3.5% of its size, more than fingers at rest on
 *  glass wander; past it they are pinching. */
export const PINCHED_LEVELS = 0.05;

/**
 * The ruler (lib/map/ruler): two fingers held still on the map for
 * HOLD_MS, and a line between them with its course each way, distance and
 * time, following the fingers until both lift. The map holds still under
 * it -- its pinch and drag off for that touch, and on again as the
 * fingers lift -- so the line's ends are the map's container points and
 * it is drawn over the map, not in it. A pinch that moves before then is
 * the map's as ever: these listeners only watch.
 */
/** The ruler on the screen and its words for a screen reader, on either map. */
export function RulerDrawing({ drawn, spoken }: { drawn: Placed | null; spoken: string }) {
  return (
    <>
      <div className="sr-only" aria-live="polite" data-testid="ruler-spoken">{spoken}</div>
      {drawn && (
        // Over the map's marks and popups, under its buttons (Leaflet's
        // panes reach 700, its controls 800).
        <div className="pointer-events-none absolute inset-0 z-[750]" data-testid="map-ruler" aria-hidden="true">
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            {/* A dark casing under a white line, seen on the day chart and the night one. */}
            <line x1={drawn.a.x} y1={drawn.a.y} x2={drawn.b.x} y2={drawn.b.y} stroke="rgb(0 0 0 / 0.6)" strokeWidth={5} strokeLinecap="round" />
            <line x1={drawn.a.x} y1={drawn.a.y} x2={drawn.b.x} y2={drawn.b.y} stroke="white" strokeWidth={2} strokeLinecap="round" />
            {[drawn.a, drawn.b].map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={5} fill="white" stroke="rgb(0 0 0 / 0.6)" strokeWidth={2} />
            ))}
          </svg>
          <div
            className="absolute flex flex-col items-stretch rounded-lg bg-black/70 px-2.5 py-1 font-semibold text-white tabular-nums"
            style={{ left: drawn.middle.x, top: drawn.middle.y, width: drawn.width, transform: `translate(-50%, -50%) rotate(${drawn.angleDeg}deg)` }}
          >
            <div className={`flex justify-between gap-3 whitespace-nowrap ${TEXT.row}`}>
              <span>{drawn.words.toLeft}</span>
              <span>{drawn.words.toRight}</span>
            </div>
            <div className={`whitespace-nowrap text-center ${TEXT.detail}`}>{drawn.words.figures}</div>
          </div>
        </div>
      )}
    </>
  );
}
