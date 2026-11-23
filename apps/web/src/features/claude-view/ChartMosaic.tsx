import { useEffect, useState } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { CHART } from "../../lib/tokens";
import { TEXT } from "../../lib/text";
import { TimelineMark } from "../procedures/lazy";
import { chartTiles, type FlightView } from "./flightView";
import { mosaicOf } from "./mosaic";
import { markOf } from "./rows";

/** The picture's box, as it is laid out now: a callback ref (`setEl`),
 *  so the box is state, measured each time it is resized. */
function useBox() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const seen = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [el]);
  return [setEl, box] as const;
}

/**
 * The chart under the route, the live view's map: the FAA sectional's own
 * tiles, from Wingtip, framing the whole route, the course in the map's
 * magenta over them, and each point's mark as FPL's timeline draws it, a
 * tap on it picking its row. A still picture, not a map to pan: the
 * pilot opens the flight in Wingtip for that.
 */
export function ChartMosaic({
  view,
  picked,
  onPick,
  className,
}: {
  view: FlightView;
  picked: string | null;
  onPick: (ident: string) => void;
  className?: string;
}) {
  const [measure, box] = useBox();
  const tiles = chartTiles(view);
  const mosaic = box.width && box.height ? mosaicOf(view, box.width, box.height) : null;
  return (
    <div ref={measure} className={cn("relative overflow-hidden rounded-xl bg-muted", className)} data-testid="view-chart">
      {mosaic && tiles && (
        <div aria-hidden>
          {mosaic.tiles.map((t) => (
            <img
              key={`${t.x}/${t.y}`}
              alt=""
              draggable={false}
              className="absolute size-64 max-w-none select-none"
              style={{ left: t.left, top: t.top }}
              src={tiles.replace("{z}", String(mosaic.zoom)).replace("{x}", String(t.x)).replace("{y}", String(t.y))}
            />
          ))}
        </div>
      )}
      {mosaic && (
        <svg className="absolute inset-0 size-full" aria-hidden>
          <polyline
            points={mosaic.line}
            fill="none"
            stroke={CHART.routeEdge}
            strokeWidth={6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polyline points={mosaic.line} fill="none" stroke={CHART.course} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
      {mosaic?.points.map((at, i) => {
        const point = view.points[i]!;
        return (
          <Button
            key={`${point.ident}-${i}`}
            variant="plain"
            size="icon-sm"
            aria-label={`${point.ident}, show its row`}
            aria-pressed={picked === point.ident}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-0 hit-1.5",
              picked === point.ident && "ring-2 ring-ring",
            )}
            style={{ left: at.left, top: at.top }}
            onClick={() => onPick(point.ident)}
          >
            <TimelineMark point={markOf(point, i)} position={false} />
          </Button>
        );
      })}
      <p className={cn("absolute right-1.5 bottom-1 rounded bg-background/80 px-1.5 text-muted-foreground", TEXT.caption)}>FAA sectional</p>
    </div>
  );
}
