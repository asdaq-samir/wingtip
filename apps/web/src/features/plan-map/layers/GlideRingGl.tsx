import type { LayerSpecification } from "maplibre-gl";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { callEngine } from "../../../lib/engine/engine";
import { useEmergencyOpen } from "../../../lib/emergencyStore";
import { useGlData, useGlLayer } from "../../../lib/map/gl/glLayer";
import { useGlideRingSetting } from "../../../lib/map/position/glideRingSetting";
import { useOwnFix } from "../../../lib/map/position/ownShip";
import { useGlideRatio } from "../../../lib/map/position/useGlideRatio";
import { nearestQuery } from "../../../lib/queryClient";
import { CHART } from "../../../lib/tokens";
import { keptStore, useKeptValue } from "../../../lib/storage";
import { useGeo } from "../../../lib/geo";

const SOURCE = "glide-ring";

/** The last nearest field's elevation the planner gave, and where the
 *  field is: kept in this browser, so the ring stays with no
 *  connection, as iOS keeps its own
 *  (InFlight.swift). */
type KeptField = { lat: number; lon: number; field_ft: number };
const keptField = () => keptStore<KeptField | null>("wingtip.glide-field", null);

/** How far from the field its elevation still stands for
 *  the ground under the glide: about a glide's own reach from a few
 *  thousand feet. Past it, no ring rather than one over the wrong ground. */
const KEPT_WITHIN_NM = 20;
/** The map's blue (design/tokens.json), a ring the pilot turned on, not the emergency's red. */
const BLUE = CHART.mapBlue;

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
 * over the nearest field's elevation -- the last one known, with no
 * connection -- none on the ground or under flying speed. While the emergency assistant is open its own ring is drawn
 * instead (EmergencyGl), wind corrected, so there is one ring, not two.
 */
export function GlideRingGl() {
  const on = useGlideRingSetting((s) => s.value);
  const emergency = useEmergencyOpen((s) => !!s.open);
  const ratio = useGlideRatio();
  // Off (its default), in an emergency or with no glide ratio, nothing
  // here reads the fix: the ring was drawn again at every GPS fix for
  // nothing while it was off.
  return on && !emergency && ratio != null ? <GlideRing ratio={ratio} /> : null;
}

/** The ring itself, following each fix, while it is to be drawn. */
function GlideRing({ ratio }: { ratio: number }) {
  const fix = useOwnFix();
  const wanted = !!fix;
  const nearest = useQuery({ ...nearestQuery(fix?.lat ?? 0, fix?.lon ?? 0), enabled: wanted });
  const field = nearest.data?.[0];
  const answered = field?.elevation_ft ?? null;
  const kept = useKeptValue(keptField());
  // Kept as each answer comes, not at every fix.
  useEffect(() => {
    if (field?.elevation_ft != null) keptField().setState({ value: { lat: field.lat, lon: field.lon, field_ft: field.elevation_ft } });
  }, [field]);
  const geo = useGeo();
  const fieldFt = answered ?? (geo && kept && fix && geo.distanceNm(kept, fix) <= KEPT_WITHIN_NM ? kept.field_ft : null);
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
