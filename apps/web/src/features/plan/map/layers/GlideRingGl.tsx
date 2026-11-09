import type { LayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { callEngine } from "../../../../lib/engine/engine";
import { useEmergencyOpen } from "../../../../lib/emergencyStore";
import { useGlData, useGlLayer } from "../../../../lib/map/gl/glLayer";
import { useGlideRingSetting } from "../../../../lib/map/position/glideRingSetting";
import { useOwnFix } from "../../../../lib/map/position/ownShip";
import { useGlideRatio } from "../../../../lib/map/position/useGlideRatio";
import { nearestQuery } from "../../../../lib/queryClient";

const SOURCE = "glide-ring";
/** The tint's blue, a ring the pilot turned on, not the emergency's red. */
const BLUE = "#007aff";

const LAYERS: LayerSpecification[] = [
  {
    id: "glide-ring",
    type: "line",
    source: SOURCE,
    paint: { "line-color": BLUE, "line-width": 2, "line-dasharray": [2, 1.5], "line-opacity": 0.85 },
  },
];

/**
 * The still-air glide ring about own ship, drawn where the pilot turned it
 * on in the Map menu (glideRingSetting; off by default, the owner,
 * 2026-11-09) and the airplane has a glide ratio of its own: the engine's
 * glide_ring (engine/crates/route/src/motion/instruments.rs) at that ratio
 * over the nearest field's elevation, none on the ground or under flying
 * speed. While the emergency assistant is open its own ring is drawn
 * instead (EmergencyGl), wind corrected, so there is one ring, not two.
 */
export function GlideRingGl() {
  const on = useGlideRingSetting((s) => s.value);
  const emergency = useEmergencyOpen((s) => !!s.open);
  const ratio = useGlideRatio();
  const fix = useOwnFix();
  const wanted = on && !emergency && ratio != null && !!fix;
  const nearest = useQuery({ ...nearestQuery(fix?.lat ?? 0, fix?.lon ?? 0), enabled: wanted });
  const fieldFt = nearest.data?.[0]?.elevation_ft ?? null;
  useGlLayer("route", { [SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: [] } } }, LAYERS);
  const data = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!wanted || !fix) return null;
    const ring = callEngine("glide_ring", {
      lat: fix.lat,
      lon: fix.lon,
      altitude_ft: fix.altitudeFt,
      speed_kt: fix.speedKt,
      field_ft: fieldFt,
      glide_ratio: ratio,
    });
    if (!ring) return { type: "FeatureCollection", features: [] };
    const line = ring.ring.map(([lat, lon]) => [lon, lat]);
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }],
    };
  }, [wanted, fix, fieldFt, ratio]);
  useGlData(SOURCE, data);
  return null;
}
