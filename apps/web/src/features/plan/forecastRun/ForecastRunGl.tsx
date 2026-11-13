import type { FeatureCollection } from "geojson";
import type { CircleLayerSpecification, FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import { useMemo } from "react";
import { useGlData, useGlLayer } from "../../../lib/map/gl/glLayer";
import { CATEGORY, CATEGORY_UNKNOWN, CHART } from "../../../lib/tokens";
import { usePastFlight } from "../map/pastFlight";
import { areasAt } from "./forecastRun";
import { useForecastMode } from "./useForecastRun";

const AREAS = "forecast-run-areas";
const POINTS = "forecast-run-points";
const EMPTY = { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } };
const SOURCES = { [AREAS]: EMPTY, [POINTS]: EMPTY };

/** Each kind of area in a colour of the chart's own tokens: a SIGMET the
 *  TFR's red, a G-AIRMET the special-use orange, the SPC outlook LIFR's
 *  magenta. */
const KIND_COLOUR = ["match", ["get", "kind"], "sigmet", CHART.tfr, "gairmet", CHART.specialUse, "outlook", CATEGORY.LIFR!, CHART.tfr];
const FILL: FillLayerSpecification = {
  id: "forecast-run-fill",
  type: "fill",
  source: AREAS,
  paint: { "fill-color": KIND_COLOUR as never, "fill-opacity": 0.12 },
};
const EDGE: LineLayerSpecification = {
  id: "forecast-run-edge",
  type: "line",
  source: AREAS,
  layout: { "line-join": "round" },
  paint: { "line-color": KIND_COLOUR as never, "line-width": 2, "line-dasharray": [2, 1.5] },
};
/** The run's points in the colour of the category forecast for when the
 *  airplane gets to each. */
const DOTS: CircleLayerSpecification = {
  id: "forecast-run-dots",
  type: "circle",
  source: POINTS,
  paint: {
    "circle-radius": 4,
    "circle-color": [
      "match",
      ["get", "category"],
      "VFR",
      CATEGORY.VFR!,
      "MVFR",
      CATEGORY.MVFR!,
      "IFR",
      CATEGORY.IFR!,
      "LIFR",
      CATEGORY.LIFR!,
      CATEGORY_UNKNOWN,
    ] as never,
    "circle-stroke-color": CHART.casing,
    "circle-stroke-width": 1,
  },
};

/**
 * The forecast on the map as the dry run plays against it (ForecastStrip's
 * answer): the SIGMETs, G-AIRMET snapshots and SPC outlook areas in force
 * at the run's moment, changing as its clock does, and the run's points in
 * the category forecast for when it gets to each. Nothing with forecast
 * mode off.
 */
export function ForecastRunGl() {
  const answer = useForecastMode((s) => s.answer);
  // The hour's quarter the areas are read at, so they are drawn again as
  // one comes or goes, not at each of the run's frames.
  const quarter = usePastFlight((s) => (s.at === null ? null : Math.floor(s.at / 900) * 900));
  useGlLayer("areas", SOURCES, [FILL, EDGE, DOTS]);
  const areas = useMemo<FeatureCollection | null>(
    () =>
      answer && quarter !== null
        ? {
            type: "FeatureCollection",
            features: areasAt(answer, quarter).map((a) => ({
              type: "Feature",
              properties: { kind: a.kind, words: a.words },
              geometry: { type: "Polygon", coordinates: [[...a.coords, a.coords[0]!].map(([lat, lon]) => [lon!, lat!])] },
            })),
          }
        : null,
    [answer, quarter],
  );
  const points = useMemo<FeatureCollection | null>(
    () =>
      answer
        ? {
            type: "FeatureCollection",
            features: answer.samples.map((s) => ({
              type: "Feature",
              properties: { category: s.category ?? "unknown" },
              geometry: { type: "Point", coordinates: [s.lon, s.lat] },
            })),
          }
        : null,
    [answer],
  );
  useGlData(AREAS, areas);
  useGlData(POINTS, points);
  return null;
}
