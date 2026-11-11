import { Suspense, lazy, useEffect, useState } from "react";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { usePointerHover } from "../../../../hooks/use-pointer-hover";
import { useGlMap } from "../../../../lib/map/gl/glLayer";

/** The preview's own chunk, with Base UI's Preview Card: fetched the first
 *  time a mouse rests on a field, never on a phone (the first load's
 *  budget). */
const AirportHoverCard = lazy(() => import("./AirportHoverCard"));

/** How long a mouse rests on a field before its preview shows, as Base
 *  UI's Preview Card waits on a link. */
const REST_MS = 500;

/**
 * A chart field's preview while a mouse rests on its mark (the owner,
 * 2026-11-09: hover previews on map markers, pointer devices only): the
 * marks are the canvas's (AirportsGl), so the field under the pointer is
 * MapLibre's, and the card is placed at it. Nothing on a touch screen,
 * where a tap opens the field's card as it always has.
 */
export default function AirportHover({ layer }: { layer: string }) {
  const hover = usePointerHover();
  const { map } = useGlMap();
  const [at, setAt] = useState<{ ident: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!hover) return;
    let timer = 0;
    let shown: string | null = null;
    const move = (e: MapLayerMouseEvent) => {
      const ident = String(e.features?.[0]?.properties?.ident ?? "");
      if (!ident || ident === shown) return;
      window.clearTimeout(timer);
      const { clientX: x, clientY: y } = e.originalEvent;
      timer = window.setTimeout(() => {
        shown = ident;
        setAt({ ident, x, y });
      }, REST_MS);
    };
    const leave = () => {
      window.clearTimeout(timer);
      shown = null;
      setAt(null);
    };
    map.on("mousemove", layer, move);
    map.on("mouseleave", layer, leave);
    map.on("mousedown", leave);
    return () => {
      window.clearTimeout(timer);
      map.off("mousemove", layer, move);
      map.off("mouseleave", layer, leave);
      map.off("mousedown", leave);
    };
  }, [hover, map, layer]);
  if (!at) return null;
  return (
    <Suspense fallback={null}>
      <AirportHoverCard ident={at.ident} x={at.x} y={at.y} />
    </Suspense>
  );
}
