import { useWeatherAgeCredit } from "../../../../lib/map/marks/weatherAge";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CircleLayerSpecification, MapGeoJSONFeature, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { api } from "../../../../lib/api/client";
import { airportsQuery } from "../airportsQuery";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { useGlData, useGlLayer, useGlMap, useGlMiss, useGlTap } from "../../../../lib/map/gl/glLayer";
import { setAirportWeather, setOverlayExclusion, setSelectedAirport } from "../../../../lib/map/gl/glOverlays";
import { useGlView } from "../../../../lib/map/gl/useGlView";
import { useGlProbe } from "../../../../lib/map/gl/useGlProbe";
import { GL_FONT_BOLD, TAP } from "../../../../lib/map/gl/layers/common";
import MapMarksList from "./MapMarksList";
import AirportHover from "./AirportHover";
import { useAirportWeatherPrefs } from "../../../../lib/map/marks/airportWeatherPrefs";
import AirportWeatherGl from "./AirportWeatherGl";
import { CHART } from "../../../../lib/tokens";

const SELECTED = "airport-selected";
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

/** The ring round the field whose card is open, in the brand's Taxiway
 *  Yellow (CHART.selected, the owner, 2026-11-09), cased as a picked
 *  point's ring is (RouteExtrasGl): white, then the shade's dark edge, so
 *  it holds over the sectional's towns, as yellow as it is (about 1.6:1
 *  there alone), and its pale greens (1.4:1). */
const ring = (id: string, color: string, width: number): CircleLayerSpecification => ({
  id,
  type: "circle",
  source: SELECTED,
  paint: { "circle-radius": 20, "circle-color": "transparent", "circle-stroke-color": color, "circle-stroke-width": width },
});
const RING = [
  ring("airport-selected-edge", `${CHART.shade}8c`, 9),
  ring("airport-selected-casing", CHART.casing, 6),
  ring("airport-selected", CHART.selected, 3),
];
/** The open card's field's ident, larger and bolder than the chart's
 *  others, white on a dark rim over the ring, as ForeFlight
 *  writes the field it shows (the owner's screenshot over Madison,
 *  2026-11-08); the tile layer leaves its own ident for it out
 *  (setSelectedAirport). Map words, not the page's: no Dynamic Type. */
const SELECTED_IDENT: SymbolLayerSpecification = {
  id: "airport-selected-ident",
  type: "symbol",
  source: SELECTED,
  layout: {
    "text-field": ["get", "ident"],
    "text-font": GL_FONT_BOLD,
    "text-size": 17,
    "text-anchor": "bottom",
    "text-offset": [0, -1.3],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": CHART.casing, "text-halo-color": CHART.tag, "text-halo-width": 2.25 },
};
/** Ten minutes, as a METAR's colour can change by the hour. */
const WEATHER_EVERY_MS = 10 * 60_000;
/** The marks' weather's address, as the worker marks an answer it kept. */
const IN_VIEW_PATH = "/api/planner/airports/in-view";

type Props = {
  selected: { ident: string; lat: number; lon: number } | null;
  onSelect: (ident: string | null) => void;
  /** The fields wearing a chip of their own already: the route's. */
  others: { ident: string; lat: number; lon: number }[];
  route: { south: number; west: number; north: number; east: number } | null;
  /** The plan's fields whose weather gets worse by the pilot's time
   *  there (worseByArrival), for their amber ↓. */
  worse: string[];
};

/**
 * The chart's airports as the planner's one mark (airportMarkSvg: a ring
 * in its airspace's chart code, a private field's R, a military field's M),
 * its weather the disc in it, sized by the field, its ident beside it -- as one
 * symbol layer, kept apart by MapLibre's collision. A tap within a
 * finger's reach opens its card, which asks the planner for the field
 * (its frequencies, runways, elevation, weather) as it opens.
 *
 * The fields are the cycle's overlay tiles' (glOverlays), loaded per tile
 * with the chart, and only their weather is asked for here -- the METARs
 * of the view and along the route (airportsQuery, the reporting fields
 * alone), joined onto the tiles' fields by ident as they come. Nothing
 * until the map has the tiles.
 */
export function AirportsGl(props: Props) {
  const { overlays } = useGlMap();
  return overlays ? <TileAirports {...props} /> : null;
}

/** The reporting fields along the route, for their weather. */
function useAlongRoute(route: Props["route"]) {
  const routeKey = route ? `${route.south},${route.west},${route.north},${route.east}` : null;
  return useQuery({
    queryKey: ["airportsReporting", routeKey],
    queryFn: () => api.airportsInView({ ...route!, limit: 1000, reporting: true }),
    enabled: !!route,
    staleTime: WEATHER_EVERY_MS,
    refetchInterval: WEATHER_EVERY_MS,
    meta: { silent: true },
  }).data;
}

/** The ring round the field whose card is open, a tap's card, a tap on
 *  the chart putting it away; and the specs' view of the marks drawn
 *  (data-airport-marks, useGlProbe). */
function useAirportTaps(
  { selected, onSelect }: Pick<Props, "selected" | "onSelect">,
  fields: (f: MapGeoJSONFeature) => Record<string, unknown>,
) {
  useGlLayer("marks", { [SELECTED]: empty() }, [...RING, SELECTED_IDENT], "airports");
  const ring = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      selected
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { ident: selected.ident },
                geometry: { type: "Point", coordinates: [selected.lon, selected.lat] },
              },
            ],
          }
        : null,
    [selected],
  );
  useGlData(SELECTED, ring);
  useGlProbe("selected-airport", ["airport-selected"], () => ({ ring: true }));
  useGlProbe("airport-marks", ["airports"], fields);
  useGlTap(["airports"], TAP.mark, TAP.rank.mark, (feature) => onSelect(String(feature.properties.ident)));
  // The chart itself tapped: the airport's card put away.
  useGlMiss(() => onSelect(null));
}

/** The overlay tiles' airports: the settings' filters and the route's
 *  own fields are the shell's and glOverlays' filters; the weather the
 *  METARs', joined by ident. */
function TileAirports(props: Props) {
  const { map } = useGlMap();
  const { others, route } = props;
  const othersKey = others.map((a) => a.ident).join();
  useEffect(() => {
    setOverlayExclusion(map, "airports", othersKey ? othersKey.split(",") : []);
  }, [map, othersKey]);
  useEffect(() => () => setOverlayExclusion(map, "airports", []), [map]);
  const selectedIdent = props.selected?.ident ?? null;
  useEffect(() => {
    setSelectedAirport(map, selectedIdent);
  }, [map, selectedIdent]);
  const { box, level } = useGlView();
  const { data: inView, dataUpdatedAt } = useQuery({
    ...airportsQuery(box, level),
    refetchInterval: WEATHER_EVERY_MS,
    placeholderData: keepPreviousData,
  });
  // Their age in the map's small print once it is old (weatherAge).
  useWeatherAgeCredit(IN_VIEW_PATH, dataUpdatedAt);
  const alongRoute = useAlongRoute(route);
  const colours = useMemo(() => {
    const out = new Map<string, string>();
    for (const list of [alongRoute, inView])
      for (const a of list ?? []) if (a.flight_category) out.set(a.ident, colourOf(a.flight_category));
    return out;
  }, [alongRoute, inView]);
  const off = useAirportWeatherPrefs((s) => s.show) === "off";
  const known = useRef(colours);
  useEffect(() => {
    known.current = colours;
    // Off: no colour for any field, so each disc is the no-report grey.
    setAirportWeather(map, off ? new Map() : colours);
  }, [map, colours, off]);
  const reporting = useMemo(() => [...(alongRoute ?? []), ...(inView ?? [])], [alongRoute, inView]);
  useAirportTaps(props, (f) => {
    const p = f.properties;
    const use = p.military === "military" ? "military" : p.use === "private" ? "private" : "";
    return {
      ident: p.ident,
      chip: true,
      space: p.airspace ?? "",
      size: p.size ?? "",
      use,
      weather: known.current.get(String(p.ident)) ?? colourOf(null),
    };
  });
  // The same fields for a screen reader and a keyboard, which cannot see
  // the canvas's symbols: the reporting ones in sight, each opening its card.
  // And a mouse resting on a mark, its preview (AirportHover).
  return (
    <>
      <MapMarksList fields={inView ?? []} onSelect={props.onSelect} />
      <AirportWeatherGl fields={reporting} worse={props.worse} />
      <AirportHover layer="airports" />
    </>
  );
}
