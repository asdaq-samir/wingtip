import type { LayerSpecification } from "maplibre-gl";
import { CHART } from "../../tokens";
import { OVERLAY_SOURCE } from "./glStyle";
import { labelHalo, labelText } from "./layers/common";

/** From MapLibre's 12, where the sectional has faded into the imagery
 *  (closeZoom): before it a runway is under a pixel or two wide and the
 *  chart's own airport symbol says more. */
const RUNWAYS_FROM = 12;

/** The runways' look, as ForeFlight draws them over its base map: a
 *  dark grey surface (a soft one lighter), a dashed white centreline, and
 *  each end's number in bold white on a dark halo, turned to read from
 *  the approach end (text-rotate is the end's true heading, so the
 *  number's top points down the runway, as it is painted). From NASR
 *  APT_RWY and APT_RWY_END: each runway's surveyed ends and width. */
export function runwayLayers(): LayerSpecification[] {
  const from = { source: OVERLAY_SOURCE, "source-layer": "runways" };
  return [
    {
      id: "runway-surface",
      type: "fill",
      ...from,
      minzoom: RUNWAYS_FROM,
      filter: ["==", ["get", "part"], "surface"],
      paint: {
        "fill-color": ["case", ["get", "hard"], CHART.runwayHard, CHART.runwaySoft],
        "fill-outline-color": CHART.casing,
        "fill-opacity": 0.95,
      },
    },
    {
      id: "runway-centreline",
      type: "line",
      ...from,
      minzoom: RUNWAYS_FROM + 1,
      filter: ["==", ["get", "part"], "centreline"],
      paint: { "line-color": CHART.casing, "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.75, 16, 2], "line-dasharray": [4, 3] },
    },
    {
      id: "runway-ends",
      type: "symbol",
      ...from,
      minzoom: RUNWAYS_FROM + 0.5,
      filter: ["==", ["get", "part"], "end"],
      layout: {
        "text-field": ["get", "end_id"],
        ...labelText("runwayNumber"),
        "text-rotation-alignment": "map",
        "text-rotate": ["get", "heading"],
        // Up the number's own page, which is down the runway from its end.
        "text-offset": [0, -1.1],
        "text-allow-overlap": true,
      },
      paint: { "text-color": CHART.casing, ...labelHalo("runwayNumber") },
    },
  ];
}
