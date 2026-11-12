import { useEffect, useRef } from "react";
import type { Map as GlMap } from "maplibre-gl";
import { cn } from "cn";
import { M_PER_NM } from "../lib/geo";
import { GLASS } from "../lib/mapChrome";
import { TEXT } from "../lib/text";

/** How long the zoom stays said once the map has stopped zooming. */
const LINGER_MS = 1500;
/** The scale bar's longest, in CSS px. */
const BAR_MOST = 96;
/** The bar's lengths, in nm: the largest that fits BAR_MOST is drawn. */
const NICE_NM = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** The bar at the map's middle now: its length in nm and in px. */
function scaleOf(map: GlMap) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const a = map.unproject([w / 2, h / 2]),
    b = map.unproject([w / 2 + BAR_MOST, h / 2]);
  const nmPerPx = a.distanceTo(b) / M_PER_NM / BAR_MOST;
  const nm = [...NICE_NM].reverse().find((n) => n / nmPerPx <= BAR_MOST) ?? 0.25;
  return { nm, px: Math.round(nm / nmPerPx) };
}

/**
 * The map's zoom level and a scale bar in nautical miles, said in the
 * banners' column while the pilot zooms and for a moment after, at the
 * owner's ask (2026-11-05: "Can I see the zoom level on the top banner as
 * I change zoom"), as Apple Maps shows its scale while a map is zoomed.
 * Only for the pilot's own zooms -- a pinch, a double tap, a wheel, a key
 * -- not the app's (a route fitted, the map brought to own ship on
 * opening): MapLibre gives a zoom the pilot started its `originalEvent`,
 * the app's own camera moves none. A pinch zooms in fractions, so to a
 * tenth. Written straight into the elements on each of the map's zoom
 * events, not through React's state, so a pinch's every frame is not a
 * render; left out for VoiceOver, which would read it at every frame.
 */
export default function ZoomBanner({ map }: { map: GlMap | null }) {
  const box = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const miles = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = box.current;
    const text = figure.current;
    if (!map || !el || !text || !bar.current || !miles.current) return;
    const line = bar.current;
    const length = miles.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Every frame of a zoom, animated or under the fingers: MapLibre's
    // `zoom` fires through the animation, with the pilot's input as its
    // originalEvent where the pilot started it.
    const onZoom = (e: { originalEvent?: Event }) => {
      if (!e.originalEvent) return;
      clearTimeout(timer);
      // In the app's levels: MapLibre's zoom is one less (glStyle).
      const shown = String(Math.round((map.getZoom() + 1) * 10) / 10);
      if (text.textContent !== shown) text.textContent = shown;
      const { nm, px } = scaleOf(map);
      const nmShown = `${nm} nm`;
      if (length.textContent !== nmShown) length.textContent = nmShown;
      line.style.width = `${px}px`;
      el.hidden = false;
    };
    const onEnd = () => {
      if (el.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.hidden = true;
      }, LINGER_MS);
    };
    map.on("zoom", onZoom);
    map.on("zoomend", onEnd);
    return () => {
      clearTimeout(timer);
      map.off("zoom", onZoom);
      map.off("zoomend", onEnd);
    };
  }, [map]);
  return (
    <div
      ref={box}
      hidden
      aria-hidden="true"
      data-testid="zoom-banner"
      className={cn(GLASS, "flex min-h-8 w-fit items-center gap-3 rounded-full px-3 tabular-nums", TEXT.detail)}
    >
      <span className="flex items-baseline gap-1">
        <span className="text-foreground/65">Zoom</span>
        <span ref={figure} className="font-semibold" />
      </span>
      {/* The scale: a bar the length of a round distance, its ends ticked
          as a chart's scale is, and the distance after it. */}
      <span className="flex items-center gap-1.5">
        <span ref={bar} className="h-1.5 border-x-2 border-b-2 border-foreground/80" />
        <span ref={miles} className="font-semibold" />
      </span>
    </div>
  );
}
