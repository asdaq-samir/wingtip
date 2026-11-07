import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { CircleLayerSpecification, MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { AirportPin } from "../../../api/types";
import { usePreferences } from "../../../preferences";
import { sectionalAirportSvg } from "../../airportMark";
import { airportsQuery } from "../../airportsQuery";
import { colourOf } from "../../flightCategory";
import { addSvgImages, useGlData, useGlLayer, useGlMap, useGlMiss, useGlTap } from "../glLayer";
import { AIRPORTS_FARTHEST_ZOOM, airportMarkId, airportMarksLayer, setAirportWeather, setOverlayExclusion } from "../glOverlays";
import { useGlView } from "../useGlView";
import { useGlProbe } from "../useGlProbe";
import { TAP } from "./common";

/** AirportsLayer's zooms, Leaflet's: every field from 8, the reporting
 *  ones from 4, each kind from its own (SHOWN_FROM), a field with no
 *  report wearing its mark from 10, a private one from 11. */
const FROM_ZOOM = 8;
const FARTHEST_ZOOM = AIRPORTS_FARTHEST_ZOOM;
const NO_REPORT_FROM_ZOOM = 10;
const PRIVATE_FROM_ZOOM = 11;
const SHOWN_FROM: Record<AirportPin["kind"], number> = { large: 6, medium: 8, small: 10, other: 12 };
const shownFrom = (a: AirportPin) =>
  Math.min(SHOWN_FROM[a.kind], a.airspace_class === "B" ? FARTHEST_ZOOM : a.airspace_class === "C" ? 6 : a.airspace_class === "D" ? FROM_ZOOM : Infinity);
/** Which field keeps its place where two would overlap: the primary field
 *  of a Class B, C or D first, then the bigger kind -- MapLibre's
 *  collision drops the later (symbol-sort-key), where declutter.ts and
 *  the 80 px rule of AirportsLayer did it by hand. */
const KIND_RANK: Record<AirportPin["kind"], number> = { large: 0, medium: 1, small: 2, other: 3 };
const PRIMARY_RANK: Record<"B" | "C" | "D", number> = { B: 0, C: 1, D: 2 };
const rankOf = (a: AirportPin) => (a.primary_of ? PRIMARY_RANK[a.primary_of] : 3) * 10 + KIND_RANK[a.kind];

const SOURCE = "airports";
const SELECTED = "airport-selected";
const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });

/** The ring round the field whose card is open (icons.ts selectionIcon). */
const RING: CircleLayerSpecification = {
  id: "airport-selected", type: "circle", source: SELECTED,
  paint: { "circle-radius": 20, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ff3b00", "circle-stroke-width": 3 },
};
/** The in-view fields' marks (no overlay tiles), each wearing its own
 *  picture by id. */
const MARKS = airportMarksLayer({ source: SOURCE }, ["get", "icon"]);
/** Ten minutes, as a METAR's colour can change by the hour. */
const WEATHER_EVERY_MS = 10 * 60_000;

type Props = {
  selected: { ident: string; lat: number; lon: number } | null;
  onSelect: (ident: string | null) => void;
  /** The fields wearing a chip of their own already: the route's. */
  others: { ident: string; lat: number; lon: number }[];
  route: { south: number; west: number; north: number; east: number } | null;
};

/**
 * The chart's airports in the sectional's symbology (sectionalAirportSvg:
 * blue towered, magenta not, a private field's R, a military field's M),
 * its weather a pip beside it, its ident in bold beside it -- as one
 * symbol layer, kept apart by MapLibre's collision. A tap within a
 * finger's reach opens its card, which asks the planner for the field
 * (its frequencies, runways, elevation, weather) as it opens.
 *
 * From the cycle's overlay tiles where the map has them (glOverlays): the
 * fields load per tile with the chart, and only their weather is asked
 * for here -- the METARs of the view and along the route, joined onto
 * the tiles' fields by ident as they come. Without the tiles, the fields
 * themselves are asked for the view (airportsQuery), as before.
 */
export function AirportsGl(props: Props) {
  const { overlays } = useGlMap();
  return overlays ? <TileAirports {...props} /> : <InViewAirports {...props} />;
}

/** The reporting fields along the route, for their weather, whichever way
 *  the fields are drawn. */
function useAlongRoute(route: Props["route"]) {
  const routeKey = route ? `${route.south},${route.west},${route.north},${route.east}` : null;
  return useQuery({
    queryKey: ["airportsReporting", routeKey],
    queryFn: () => api.airportsInView({ ...route!, limit: 1000, reporting: true }),
    enabled: !!route, staleTime: WEATHER_EVERY_MS, refetchInterval: WEATHER_EVERY_MS, meta: { silent: true },
  }).data;
}

/** The ring round the field whose card is open, a tap's card, a tap on
 *  the chart putting it away; and the specs' view of the marks drawn
 *  (AirportCanvas' data-airport-marks). */
function useAirportTaps({ selected, onSelect }: Pick<Props, "selected" | "onSelect">, fields: (f: MapGeoJSONFeature) => Record<string, unknown>) {
  useGlLayer("marks", { [SELECTED]: empty() }, [RING], "airports");
  const ring = useMemo<GeoJSON.FeatureCollection | null>(() => (selected
    ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [selected.lon, selected.lat] } }] }
    : null), [selected]);
  useGlData(SELECTED, ring);
  useGlProbe("selected-airport", ["airport-selected"], () => ({ ring: true }));
  useGlProbe("airport-marks", ["airports"], fields);
  useGlTap(["airports"], TAP.mark, TAP.rank.mark, feature => onSelect(String(feature.properties.ident)));
  // The chart itself tapped: the airport's card put away, as on Leaflet.
  useGlMiss(() => onSelect(null));
}

/** The overlay tiles' airports: the settings' filters and the route's
 *  own fields are the shell's and glOverlays' filters; the weather the
 *  METARs', joined by ident. */
function TileAirports(props: Props) {
  const { map } = useGlMap();
  const { others, route } = props;
  const othersKey = others.map(a => a.ident).join();
  useEffect(() => { setOverlayExclusion(map, "airports", othersKey ? othersKey.split(",") : []); }, [map, othersKey]);
  useEffect(() => () => setOverlayExclusion(map, "airports", []), [map]);
  const { box, level } = useGlView();
  const { data: inView } = useQuery({
    ...airportsQuery(box, level, true), refetchInterval: WEATHER_EVERY_MS, placeholderData: keepPreviousData,
  });
  const alongRoute = useAlongRoute(route);
  const colours = useMemo(() => {
    const out = new Map<string, string>();
    for (const list of [alongRoute, inView]) for (const a of list ?? []) if (a.flight_category) out.set(a.ident, colourOf(a.flight_category));
    return out;
  }, [alongRoute, inView]);
  const known = useRef(colours);
  useEffect(() => {
    known.current = colours;
    setAirportWeather(map, colours);
  }, [map, colours]);
  useAirportTaps(props, f => {
    const p = f.properties;
    const use = p.military === "military" ? "military" : p.use === "private" ? "private" : "";
    return { ident: p.ident, chip: true, space: "", use, weather: known.current.get(String(p.ident)) ?? colourOf(null) };
  });
  return null;
}

/** The fields asked for the view (no overlay tiles), as AirportsLayer
 *  asks them on the Leaflet map: the same zooms and filters (military,
 *  private). */
function InViewAirports(props: Props) {
  const { selected, others, route } = props;
  const { map } = useGlMap();
  const showMilitary = usePreferences(s => s.military);
  const showPrivate = usePreferences(s => s.privateFields);
  const { box, level } = useGlView();
  const { data: inView } = useQuery({ ...airportsQuery(box, level), refetchInterval: WEATHER_EVERY_MS, placeholderData: keepPreviousData });
  const alongRoute = useAlongRoute(route);
  const exclude = useMemo(() => new Set(others.map(a => a.ident)), [others]);
  const shown = useMemo(() => {
    if (level < FARTHEST_ZOOM) return [];
    const byIdent = new Map<string, AirportPin>();
    for (const list of [alongRoute, inView]) for (const a of list ?? []) byIdent.set(a.ident, a);
    const near = level >= FROM_ZOOM;
    return [...byIdent.values()].filter(a => !exclude.has(a.ident) && (level >= shownFrom(a) || a.ident === selected?.ident)
      && (near || a.flight_category) && (showMilitary || a.military !== "military") && (showPrivate || !a.private));
  }, [alongRoute, inView, exclude, level, selected, showMilitary, showPrivate]);

  useGlLayer("marks", { [SOURCE]: empty() }, [MARKS]);
  // The pictures first, then the features that wear them.
  const [features, setFeatures] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let live = true;
    const marks = shown.filter(a => !!a.flight_category || level >= (a.private ? PRIVATE_FROM_ZOOM : NO_REPORT_FROM_ZOOM));
    const looks = new Map<string, () => string>();
    const feats: GeoJSON.Feature[] = marks.map(a => {
      const weather = colourOf(a.flight_category);
      const use = a.military === "military" ? "military" : a.private ? "private" : null;
      const towered = !!a.towered;
      const pip = a.flight_category ? weather : null;
      const icon = airportMarkId(towered, a.kind, pip, use);
      looks.set(icon, () => sectionalAirportSvg(towered, a.kind, use, pip));
      return { type: "Feature", properties: { ident: a.ident, icon, rank: rankOf(a), towered, space: a.airspace_class ?? "", use: use ?? "", weather }, geometry: { type: "Point", coordinates: [a.lon, a.lat] } };
    });
    void addSvgImages(map, looks).then(() => { if (live) setFeatures({ type: "FeatureCollection", features: feats }); });
    return () => { live = false; };
  }, [map, shown, level]);
  useGlData(SOURCE, features);
  useAirportTaps(props, f => ({ ident: f.properties.ident, chip: true, space: f.properties.space, use: f.properties.use, weather: f.properties.weather }));
  return null;
}
