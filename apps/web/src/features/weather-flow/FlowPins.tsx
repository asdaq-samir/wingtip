import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Marker } from "maplibre-gl";
import { useGlMap } from "../../lib/map/gl/glLayer";
import { useOwnShipNear } from "../../lib/map/position/ownShip";
import { usePreferences } from "../../lib/preferences";
import { FlowPill } from "./FlowBubble";
import { useFlowTexture, valueAt } from "./flowTexture";
import type { FlowFrame, FlowLayer } from "./useWeatherFlow";

/**
 * The temperature at the pilot's own position and at each of their
 * favourite airports, a small white pill each, as Apple Weather's
 * temperature map marks My Location and the saved places (the owner's
 * screenshot, 2026-11-12). Read from the picture the layer already has
 * (valueAt, as the bubble reads it), so no more is fetched; own ship's
 * position as the page has it near (useOwnShipNear, a hundredth of a
 * degree), so a moving fix does not draw them again each second.
 */
export function FlowPins({ layer, frame, file = "temp" }: { layer: FlowLayer; frame: FlowFrame | null; file?: string }) {
  const own = useOwnShipNear();
  const favorites = usePreferences((s) => s.favoriteAirports);
  const texture = useFlowTexture(frame, file);
  const points = useMemo(() => {
    const out: { key: string; at: [number, number] }[] = [];
    if (own) out.push({ key: "own", at: [own.lon, own.lat] });
    for (const f of favorites) if (f.lat !== undefined && f.lon !== undefined) out.push({ key: f.ident, at: [f.lon, f.lat] });
    return out;
  }, [own, favorites]);
  return (
    <>
      {points.map((p) => (
        <Pin key={p.key} at={p.at} value={valueAt(layer, file, texture, p.at)?.value ?? null} />
      ))}
    </>
  );
}

function Pin({ at, value }: { at: [number, number]; value: number | null }) {
  const { map } = useGlMap();
  const el = useMemo(() => document.createElement("div"), []);
  const marker = useMemo(() => new Marker({ element: el, anchor: "bottom", offset: [0, -14] }), [el]);
  const [lon, lat] = at;
  useEffect(() => {
    marker.setLngLat([lon, lat]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, marker, lon, lat]);
  return createPortal(<FlowPill value={value} testId="weather-flow-pin" />, el);
}
