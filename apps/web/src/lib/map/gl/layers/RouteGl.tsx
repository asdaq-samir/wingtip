import type { CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, type ReactNode } from "react";
import type { Course } from "../../../api/types";
import type { AirspaceClass } from "../../../preferences";
import { courseColour } from "../../chartColors";
import { dotIcon, fixMarkIcon } from "../../icons";
import { routeFieldIcon } from "../../routeMarks";
import { usePreferences } from "../../../preferences";
import { useSunlight } from "../../../sunlight";
import { useGlData, useGlLayer, useGlMap, useGlPaint, useGlTap } from "../glLayer";
import { useDarkTheme } from "../useDarkTheme";
import { CHECKPOINT_SOURCE, ROUTE_SOURCE, glZoom, pointFeatures, routeCasingPaint, routeEdgePaint, routeFeature, routeLayers } from "../glStyle";
import { useGlProbe } from "../useGlProbe";
import { GL_FONT, TAP } from "./common";
import { ROUTE_PRIORITY } from "../declutter";
import { useGlMarks, type GlMark } from "../useGlMarks";
import { LEG_RANK, LEG_REACH, nearestLeg, type GlLeg } from "../legTap";

export interface GlCheckpoint {
  key: string;
  lat: number;
  lon: number;
  number: number;
  /** Its name as its label shows it (RouteMap's labelOf). */
  name: string;
  colour: string;
  card: ReactNode;
  select: () => void;
}

export interface GlCandidate {
  key: string;
  lat: number;
  lon: number;
  colour: string;
  /** Its card, opened by a tap; or what a tap does instead (the training
   *  map's, which selects it). */
  card?: ReactNode;
  select?: () => void;
}

export interface GlEndpoint {
  ident: string;
  lat: number;
  lon: number;
  colour: string;
  /** Its airspace's class (the mark's ring); a waypoint flown through has none. */
  space: AirspaceClass | null;
  fix: boolean;
  select: () => void;
}

/** Every checkpoint in sight named from 10, in the app's levels. */
const NAME_ZOOM = 10;

const empty = () => ({ type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } });
const CANDIDATES = "candidates";
const NO_LEGS: GlLeg[] = [];
const LINE_SOURCES = { [ROUTE_SOURCE]: empty() };
const MARK_SOURCES = { [CHECKPOINT_SOURCE]: empty(), [CANDIDATES]: empty() };

/** Every point the model scored, small and dim, under the chosen. */
const CANDIDATE_DOTS: CircleLayerSpecification = {
  id: "candidates", type: "circle", source: CANDIDATES,
  paint: { "circle-radius": 4, "circle-color": ["get", "colour"], "circle-opacity": 0.5, "circle-stroke-color": "#5b6b76", "circle-stroke-width": 1, "circle-stroke-opacity": 0.65 },
};
/** A checkpoint's name beside its dot, on whichever side is clear, from
 *  NAME_ZOOM: MapLibre's collision, where useLabelled placed each by hand. */
const NAMES: SymbolLayerSpecification = {
  id: "checkpoint-names", type: "symbol", source: CHECKPOINT_SOURCE, minzoom: glZoom(NAME_ZOOM),
  layout: {
    "text-field": ["get", "name"], "text-font": GL_FONT, "text-size": 12,
    "text-variable-anchor": ["left", "right"], "text-radial-offset": 1.3, "text-justify": "auto",
    "symbol-sort-key": ["get", "number"],
  },
  paint: { "text-color": "#1c1a17", "text-halo-color": "#ffffff", "text-halo-width": 2 },
};

/**
 * The route: the course line (a magenta core cased in green, as
 * ForeFlight draws a route, with a dark edge round it; a tap on it the
 * nearest leg's Route Leg sheet), its checkpoints numbered in flight
 * order and named closer in (a tap the checkpoint's card, the map flying
 * in to it), the points they were chosen from, and its departure, stops
 * and destination as every airport's mark on the chart, in its weather,
 * the ident on a dark pill (routeFieldIcon; a tap its card).
 */
export function RouteGl({ course, checkpoints, candidates, endpoints, legs = NO_LEGS, onSelectLeg }: {
  course: Course | null; checkpoints: GlCheckpoint[]; candidates: GlCandidate[]; endpoints: GlEndpoint[];
  legs?: GlLeg[]; onSelectLeg?: (key: string) => void;
}) {
  const layers = useMemo(() => routeLayers(courseColour()), []);
  // The line in the route's slot, the marks over every mark on the chart.
  useGlLayer("route", LINE_SOURCES, layers.filter(l => "source" in l && l.source === ROUTE_SOURCE));
  useGlLayer("top", MARK_SOURCES, [CANDIDATE_DOTS, NAMES]);
  // The casing follows the look, as the chart's paint does (ChartGl).
  const sunlight = useSunlight();
  const dark = useDarkTheme();
  const chartNight = usePreferences(s => s.chartNight);
  const night = dark && chartNight === "dimmed";
  useGlPaint(["route-edge"], routeEdgePaint(night, sunlight));
  useGlPaint(["route-casing"], routeCasingPaint(night));
  const line = useMemo(() => (course ? routeFeature(course.course_line as [number, number][]) : null), [course]);
  useGlData(ROUTE_SOURCE, line);
  // The course drawn, for the browser tests.
  useGlProbe("route-line", ["route-core"], () => ({ course: true }));
  useGlProbe("candidate-marks", ["candidates"], f => ({ key: f.properties.key }));
  // The checkpoints' names the chart shows, those MapLibre placed clear of
  // each other (a name it could not fit is not drawn), for the tests.
  useGlProbe("checkpoint-names", [NAMES.id], f => ({ name: f.properties.name }));
  const dots = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: checkpoints.map(c => ({
      type: "Feature", properties: { key: c.key, label: String(c.number), number: c.number, name: c.name, colour: c.colour },
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
    })),
  }), [checkpoints]);
  useGlData(CHECKPOINT_SOURCE, dots);
  const others = useMemo(() => pointFeatures(candidates.map(c => ({ key: c.key, lat: c.lat, lon: c.lon, label: "", colour: c.colour }))), [candidates]);
  useGlData(CANDIDATES, others);
  // The route's marks give way by priority (declutter): its destination's
  // ident over every other, its other fields next, the checkpoints in
  // flight order after them, the tops of climb and descent last.
  const fields = useMemo<GlMark[]>(() => endpoints.map((e, i) => ({
    priority: i === endpoints.length - 1 ? ROUTE_PRIORITY.destination : ROUTE_PRIORITY.field,
    key: e.ident, lat: e.lat, lon: e.lon, onTap: e.select,
    icon: e.fix ? fixMarkIcon(e.ident) : routeFieldIcon(e.ident, e.space, e.colour),
  })), [endpoints]);
  useGlMarks(fields);
  // The chosen checkpoints as the app's numbered dots (icons.ts dotIcon),
  // markers a tap selects and opens the card of, the map flying in to it:
  // a route's few dozen, the nav log's numbers on them.
  const { openCard } = useGlMap();
  const numbered = useMemo<GlMark[]>(() => checkpoints.map(c => ({
    key: `cp-${c.key}`, lat: c.lat, lon: c.lon, icon: dotIcon(c.colour, c.number),
    // The earlier of two that meet kept: the one flown to first.
    priority: ROUTE_PRIORITY.checkpoint - c.number / 1000,
    onTap: () => { c.select(); openCard(c.card); },
  })), [checkpoints, openCard]);
  useGlMarks(numbered);
  // A tap on the course within a finger's reach of it, nothing nearer
  // taken first (LEG_RANK), the nearest leg's sheet.
  const { map } = useGlMap();
  // Each leg's ends where they are on the screen, for the browser tests to
  // tap one, and to tap the chart clear of them (helpers' tapTheChart).
  useGlProbe("route-legs", ["route-edge"], () => ({
    legs: legs.map(l => ({ key: l.key, ends: [l.from, l.to].map(p => map.project([p.lon, p.lat])).map(p => [Math.round(p.x), Math.round(p.y)]) })),
  }));
  // The legs come in after the line is drawn, with nothing on the map to
  // draw again: a frame asked for, so the probe's next idle has them.
  useEffect(() => { map.triggerRepaint(); }, [map, legs]);
  useGlTap(onSelectLeg ? ["route-edge"] : [], LEG_REACH, LEG_RANK, (_feature, event) => {
    const leg = nearestLeg(legs, event.point, p => map.project([p.lon, p.lat]));
    if (leg) onSelectLeg?.(leg.key);
  });
  useGlTap(["candidates"], 8, TAP.rank.checkpoint + 0.5, feature => {
    const c = candidates.find(p => p.key === String(feature.properties.key));
    if (c?.select) c.select();
    else if (c?.card) openCard(c.card);
  });
  return null;
}
