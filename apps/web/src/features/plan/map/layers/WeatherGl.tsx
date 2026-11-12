import { useQuery } from "@tanstack/react-query";
import type {
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  Map as MlMap,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { useMemo } from "react";
import { api } from "../../../../lib/api/client";
import { areaColour } from "../../lib/weatherMap";
import { AreaCard, PirepCard, WindCard } from "../WeatherCards";
import { PIREP_SHIFT, pirepMarks, weatherBoxOf, windBarb } from "../weatherLayer";
import { useWeatherLayers } from "../../../../lib/map/sources/weatherLayers";
import { WINDS_MODELLED } from "../../../../lib/windsAloft";
import { useGlData, useGlFadeIn, useGlLayer, useGlMap, useGlTap } from "../../../../lib/map/gl/glLayer";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { TAP } from "../../../../lib/map/gl/layers/common";
import { chipLayer, pictureLayer } from "../../../../lib/map/gl/markLayers";
import { useGlSymbols, type GlSymbol } from "../../../../lib/map/gl/useGlSymbols";
import { useGlView } from "../../../../lib/map/gl/useGlView";

const REFRESH_MS = 5 * 60_000;
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

const AREAS = "wx-areas";
/** An advisory's area bold, a forecast's (a G-AIRMET) dashed, each in its
 *  hazard's colour over a wash of it (weatherMap areaColour). */
const AREA_LAYERS: (FillLayerSpecification | LineLayerSpecification)[] = [
  { id: "wx-area-fill", type: "fill", source: AREAS, paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.12 } },
  {
    id: "wx-area-line",
    type: "line",
    source: AREAS,
    filter: ["!", ["get", "forecast"]],
    paint: { "line-color": ["get", "colour"], "line-width": 2.5 },
  },
  {
    id: "wx-area-forecast",
    type: "line",
    source: AREAS,
    filter: ["get", "forecast"],
    paint: { "line-color": ["get", "colour"], "line-width": 2, "line-dasharray": [3, 2.5] },
  },
];

/**
 * The weather on the map at the pilot's pick (useWeatherLayers): the
 * advisories' areas, the PIREPs and the winds aloft from the planner's
 * weather map for the view (the radar and satellite are the loop's,
 * features/weather-loop) --
 * drawn bold, as what changes by the hour over the chart. A tap on an
 * area, a PIREP or a barb opens its card.
 */
export function WeatherGl({ line, altitudeFt }: { line: [number, number][] | null; altitudeFt: number | null }) {
  const { openCard } = useGlMap();
  const { areas, pireps, winds } = useWeatherLayers();
  const { box } = useGlView(weatherBox, "rest");
  const windsFt = winds === "off" ? null : winds === "plan" ? (altitudeFt ?? 9000) : winds;
  const { data } = useQuery({
    queryKey: ["weatherMap", box, windsFt],
    queryFn: () => api.weatherMap(box, windsFt),
    enabled: areas || pireps || windsFt !== null,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    meta: { silent: true },
  });

  useGlLayer("areas", { [AREAS]: empty() }, AREA_LAYERS);
  // Faded in as the first answer comes, not snapped on over the chart.
  useGlFadeIn(AREA_LAYERS, !!data);
  const areaFeatures = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      areas && data
        ? {
            type: "FeatureCollection",
            features: data.advisories.map((a) => ({
              type: "Feature",
              properties: { id: a.id, colour: areaColour(a), forecast: a.kind === "gairmet" },
              geometry: { type: "Polygon", coordinates: [(a.coords as [number, number][]).map(([lat, lon]) => [lon, lat])] },
            })),
          }
        : null,
    [areas, data],
  );
  useGlData(AREAS, areaFeatures);
  useGlProbe("weather-areas", ["wx-area-fill"], (f) => ({ id: f.properties.id, colour: f.properties.colour }));
  useGlTap(["wx-area-fill"], 1, TAP.rank.area + 1, (feature) => {
    const a = data?.advisories.find((q) => q.id === feature.properties.id);
    if (a) openCard(<AreaCard key={a.id} area={a} line={line} altitudeFt={altitudeFt} />);
  });

  // The PIREPs as chips and the winds as barbs, each a tap opens the card of.
  const marks = useMemo<GlSymbol[]>(
    () => [
      ...(pireps
        ? (data?.pireps ?? []).map((p, i) => {
            const { picture, text, colour } = pirepMarks(p);
            return {
              key: `pirep-${p.lat},${p.lon},${p.observed_at ?? i}`,
              lat: p.lat,
              lon: p.lon,
              picture,
              text,
              props: { kind: "pirep", colour },
              onTap: () => openCard(<PirepCard key={`${p.lat},${p.lon},${i}`} pirep={p} />),
            };
          })
        : []),
      ...(windsFt !== null
        ? (data?.winds?.stations ?? []).map((w) => ({
            key: `wind-${w.ident}`,
            lat: w.lat,
            lon: w.lon,
            picture: windBarb(w),
            props: {
              kind: "wind",
              dir: Math.round(w.dir_true_deg),
              title: `${w.ident}: ${Math.round(w.dir_true_deg)}° true at ${Math.round(w.speed_kt)} kt, ${WINDS_MODELLED}`,
            },
            onTap: () => openCard(<WindCard key={w.ident} wind={w} altitudeFt={windsFt} />),
          }))
        : []),
    ],
    [data, pireps, windsFt, openCard],
  );
  // Faded in as they come, not snapped on over the chart.
  useGlSymbols(MARKS, MARK_LAYERS, marks, { fade: true });
  return null;
}

/** The weather's grid box round the view at rest. */
const weatherBox = (map: MlMap) => weatherBoxOf(map.getBounds());

const MARKS = "wx-marks";
const KIND = (kind: string) => ["==", ["get", "kind"], kind] as ExpressionSpecification;
/** The barbs turned on the chart by the wind's direction, under the PIREPs'
 *  chips, their level in the hazard's colour. */
const MARK_LAYERS: SymbolLayerSpecification[] = [
  { ...pictureLayer("wx-winds", MARKS, {}, { "icon-rotate": ["get", "dir"], "icon-rotation-alignment": "map" }), filter: KIND("wind") },
  {
    ...chipLayer(
      "wx-pireps",
      MARKS,
      {},
      { "text-size": 12, "text-offset": [PIREP_SHIFT, 0] },
      { "text-color": ["get", "colour"] as ExpressionSpecification },
    ),
    filter: KIND("pirep"),
  },
];
