import { useWeatherAgeCredit } from "../../../lib/map/marks/weatherAge";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MapGeoJSONFeature, MapSourceDataEvent, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api/client";
import { airportsQuery } from "../airportsQuery";
import { colourOf } from "../../../lib/map/marks/flightCategory";
import { useGlData, useGlLayer, useGlMap, useGlTap } from "../../../lib/map/gl/glLayer";
import { prefetchAirport } from "../../../lib/queryClient";
import {
  AIRPORTS_SOURCE,
  AIRPORT_ICON_SIZE,
  AIRPORT_SHOWN,
  AIRPORT_TILE_LAYERS,
  OVERLAY_SOURCE,
  markSelectedAirport,
  setAirportWeather,
  setOverlayExclusion,
} from "../../../lib/map/gl/glOverlays";
import { TILE_AIRPORT_ICON } from "../../../lib/map/gl/airportIcons";
import { glZoom } from "../../../lib/map/gl/glStyle";
import { MAP_ZOOM } from "../../../lib/tokens";
import { useGlView } from "../../../lib/map/gl/useGlView";
import { useGlProbe } from "../../../lib/map/gl/useGlProbe";
import { usePlacedFieldRings } from "../../../lib/map/gl/placedRings";
import { TAP, labelHalo, labelText, selectionRing } from "../../../lib/map/gl/layers/common";
import MapMarksList from "./MapMarksList";
import AirportHover from "./AirportHover";
import { useAirportWeatherShown } from "../../../lib/map/marks/useAirportWeatherShown";
import AirportWeatherGl from "./AirportWeatherGl";
import { CHART } from "../../../lib/tokens";

const SELECTED = "airport-selected";
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

/** The ring round the field whose card is open, or the Stops' field
 *  picked: the one ring every pick wears (selectionRing). */
const RING = selectionRing("airport-selected", SELECTED);
/** The open card's field's ident, larger and bolder than the chart's
 *  others, white on a dark rim over the ring, as ForeFlight
 *  writes the field it shows (the owner's screenshot over Madison,
 *  2026-11-08); the tile layer leaves its own ident for it out
 *  (setSelectedAirport). Not where the field wears its own chip (the
 *  route's, a Class B field's, a stop's, `chipped`): its ident is said
 *  once, on its chip. Map words, not the page's: no Dynamic Type. */
const SELECTED_IDENT: SymbolLayerSpecification = {
  id: "airport-selected-ident",
  type: "symbol",
  source: SELECTED,
  filter: ["!", ["get", "chipped"]],
  layout: {
    "text-field": ["get", "ident"],
    ...labelText("airportPicked"),
    "text-anchor": "bottom",
    "text-offset": [0, -1.3],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: { "text-color": CHART.casing, ...labelHalo("airportPicked") },
};
/** The open card's field's mark, the tile layers' own picture and size
 *  (glOverlays) from the tile's fields copied onto the ring's feature,
 *  always drawn and keeping its room as a Class B's field's mark does, over
 *  the tile's own copy, the same picture at the same size; the tile layers
 *  hide only their ident by its feature state (markSelectedAirport), so a
 *  tap changes no filter and lays no overlay tile out again. None where the
 *  field wears its own chip, nor one the settings hide. */
const SELECTED_MARK: SymbolLayerSpecification = {
  id: "airport-selected-mark",
  type: "symbol",
  source: SELECTED,
  minzoom: glZoom(MAP_ZOOM.airportsFarthest),
  filter: ["all", ["==", ["get", "tile"], true], ["!", ["get", "chipped"]], ...AIRPORT_SHOWN],
  layout: { "icon-image": TILE_AIRPORT_ICON, "icon-size": AIRPORT_ICON_SIZE, "icon-allow-overlap": true, "icon-padding": 2 },
};
/** Every layer a field's mark is drawn in, for the taps, the probes and
 *  the rings of the fields drawn: the tiles' and the open card's field's. */
const MARK_LAYERS = [...AIRPORT_TILE_LAYERS, SELECTED_MARK.id];
/** The longest the open card's field's tile ident waits for the ring's to be drawn. */
const HIDE_LATEST_MS = 300;
/** Ten minutes, as a METAR's colour can change by the hour. */
const WEATHER_EVERY_MS = 10 * 60_000;
/** The marks' weather's address, as the worker marks an answer it kept. */
const IN_VIEW_PATH = "/api/planner/airports/in-view";

type Props = {
  selected: { ident: string; lat: number; lon: number } | null;
  onSelect: (ident: string | null) => void;
  /** The Stops' field picked on the chart (its row picked in the Stops
   *  card, no card of its own): ringed as a field whose card is open is. */
  picked?: { ident: string; lat: number; lon: number } | null;
  /** The fields wearing a chip of their own already: the route's, the
   *  Class B ones, the Stops' and the fuel stops'. */
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

/** The ring round the field whose card is open (or the Stops' field
 *  picked), a tap's card; and the specs' view of the marks drawn
 *  (data-airport-marks, useGlProbe). A tap on the chart puts the card away
 *  with every other pick (GlMapShell, lib/map/mapPick). */
function useAirportTaps(
  { selected, picked, others, onSelect }: Pick<Props, "selected" | "picked" | "others" | "onSelect">,
  fields: (f: MapGeoJSONFeature) => Record<string, unknown>,
) {
  useGlLayer("top", { [SELECTED]: empty() }, [SELECTED_MARK, ...RING, SELECTED_IDENT]);
  const ringed = selected ?? picked ?? null;
  const chipped = !!ringed && others.some((a) => a.ident === ringed.ident);
  const [tile, seedTile] = useTileField(ringed?.ident ?? null);
  const ring = useMemo<GeoJSON.FeatureCollection | null>(
    () =>
      ringed
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { ...tile, tile: !!tile, ident: ringed.ident, chipped },
                geometry: { type: "Point", coordinates: [ringed.lon, ringed.lat] },
              },
            ],
          }
        : null,
    [ringed, chipped, tile],
  );
  useGlData(SELECTED, ring);
  useGlProbe("selected-airport", ["airport-selected"], () => ({ ring: true }));
  useGlProbe("airport-marks", MARK_LAYERS, fields);
  useGlTap(
    MARK_LAYERS,
    TAP.mark,
    TAP.rank.mark,
    (feature) => {
      const ident = String(feature.properties.ident);
      // The tile's own fields, copied at the tap, so its mark over the ring
      // is drawn with the card's first frame, not a querySourceFeatures later.
      if (AIRPORT_TILE_LAYERS.includes(feature.layer.id)) seedTile(ident, feature.properties);
      onSelect(ident);
    },
    // Its card's answer asked as the finger lifts, before MapLibre's click,
    // so the card opens on it sooner (the speed work, 2026-11-27).
    (feature) => prefetchAirport(String(feature.properties.ident)),
  );
}

type Found = { ident: string; fields: Record<string, unknown> };

/** A field's fields as the airports' tiles have them (its airspace, use,
 *  size, rank), for its mark drawn over its ring: those of the tapped tile
 *  feature (`seed`, at the tap), or looked for as each airports tile comes
 *  in until one has it (a field picked in a search or a link, far from the
 *  tiles drawn). */
function useTileField(ident: string | null): [Record<string, unknown> | null, (ident: string, fields: Record<string, unknown>) => void] {
  const { map } = useGlMap();
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!ident) return;
    const look = (e?: MapSourceDataEvent) => {
      if ((e && (e.sourceId !== AIRPORTS_SOURCE || !e.tile)) || !map.getSource(AIRPORTS_SOURCE)) return;
      const f = map.querySourceFeatures(AIRPORTS_SOURCE, { sourceLayer: "airports", filter: ["==", ["get", "ident"], ident] })[0];
      if (!f) return;
      map.off("sourcedata", look);
      // Kept as it was where the tap's seed has it, so the ring is not set again.
      setFound((was) => (was?.ident === ident ? was : { ident, fields: f.properties }));
    };
    map.on("sourcedata", look);
    const first = requestAnimationFrame(() => look());
    return () => {
      cancelAnimationFrame(first);
      map.off("sourcedata", look);
    };
  }, [map, ident]);
  const seed = (ident: string, fields: Record<string, unknown>) => setFound({ ident, fields });
  return [found && found.ident === ident ? found.fields : null, seed];
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
  // The Class C and D rings drawn only round a field that is (placedRings).
  usePlacedFieldRings(
    map,
    OVERLAY_SOURCE,
    AIRPORTS_SOURCE,
    MARK_LAYERS,
    others.map((a) => a.ident),
  );
  // The ringed field's tile ident hidden (its feature state) once the
  // ring's layers have it to draw: set at the tap, it was gone two to four
  // frames before the ring's source came back from MapLibre's worker.
  const selectedIdent = (props.selected ?? props.picked)?.ident ?? null;
  useEffect(() => {
    if (!selectedIdent) return;
    let hidden = false;
    const hide = () => {
      if (hidden || !map.style) return;
      hidden = true;
      map.off("sourcedata", drawn);
      markSelectedAirport(map, selectedIdent, true);
    };
    const drawn = (e: MapSourceDataEvent) => {
      if (e.sourceId === SELECTED && e.sourceDataType !== "metadata" && map.getSource(SELECTED) && map.isSourceLoaded(SELECTED)) hide();
    };
    map.on("sourcedata", drawn);
    // However the ring's source answers, the ident is not drawn twice for long.
    const late = setTimeout(hide, HIDE_LATEST_MS);
    return () => {
      clearTimeout(late);
      map.off("sourcedata", drawn);
      if (hidden) markSelectedAirport(map, selectedIdent, false);
    };
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
  const off = useAirportWeatherShown() === "off";
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
