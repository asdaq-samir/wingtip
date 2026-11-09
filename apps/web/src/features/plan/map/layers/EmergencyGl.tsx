import type { LayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { useEmergencyLine } from "../../../../lib/map/marks/emergencyLine";
import { useGlData, useGlLayer } from "../../../../lib/map/gl/glLayer";

const SOURCE = "emergency";
/** The emergency's ink: iOS's system red, what a pilot reads as now. */
const RED = "#ff3b30";

const LAYERS: LayerSpecification[] = [
  {
    id: "emergency-ring", type: "line", source: SOURCE, filter: ["==", ["get", "kind"], "ring"],
    paint: { "line-color": RED, "line-width": 2.5, "line-dasharray": [2, 1.5], "line-opacity": 0.9 },
  },
  { id: "emergency-line-casing", type: "line", source: SOURCE, filter: ["==", ["get", "kind"], "to"], paint: { "line-color": "#ffffff", "line-width": 7 } },
  { id: "emergency-line", type: "line", source: SOURCE, filter: ["==", ["get", "kind"], "to"], paint: { "line-color": RED, "line-width": 4 } },
  {
    id: "emergency-field", type: "circle", source: SOURCE, filter: ["==", ["get", "kind"], "field"],
    paint: { "circle-radius": 16, "circle-opacity": 0, "circle-stroke-color": RED, "circle-stroke-width": 4 },
  },
];

/** The emergency assistant's glide ring and the line to the field picked
 *  (lib/map/marks/emergencyLine), over the route and under own ship. */
export function EmergencyGl() {
  const drawing = useEmergencyLine(s => s.drawing);
  useGlLayer("route", { [SOURCE]: { type: "geojson", data: { type: "FeatureCollection", features: [] } } }, LAYERS);
  const data = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!drawing) return null;
    const features: GeoJSON.Feature[] = [];
    if (drawing.ring?.length) {
      const ring = drawing.ring.map(([lat, lon]) => [lon!, lat!]);
      features.push({ type: "Feature", properties: { kind: "ring" }, geometry: { type: "LineString", coordinates: [...ring, ring[0]!] } });
    }
    if (drawing.to) {
      const { from, to } = drawing;
      features.push({ type: "Feature", properties: { kind: "to" }, geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] } });
      features.push({ type: "Feature", properties: { kind: "field" }, geometry: { type: "Point", coordinates: [to.lon, to.lat] } });
    }
    return { type: "FeatureCollection", features };
  }, [drawing]);
  useGlData(SOURCE, data);
  return null;
}
