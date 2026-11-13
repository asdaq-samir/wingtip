import type { CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useMemo, type ReactNode } from "react";
import type { Course } from "../../../api/types";
import type { AirspaceClass } from "../../../preferences";
import { courseColour } from "../../marks/chartColors";
import { ROUTE_MARKS, ROUTE_MARK_LAYERS, routeMarks } from "../../marks/routeMarks";
import { usePreferences } from "../../../preferences";
import { useSunlight } from "../../../sunlight";
import { useGlData, useGlLayer, useGlMap, useGlPaint, useGlTap } from "../glLayer";
import { useDarkTheme } from "../useDarkTheme";
import {
  CHECKPOINT_SOURCE,
  ROUTE_SOURCE,
  glZoom,
  pointFeatures,
  routeCasingPaint,
  routeEdgePaint,
  routeFeature,
  routeLayers,
  routeOuterPaint,
  selectedLegFilter,
} from "../glStyle";
import { useGlProbe } from "../useGlProbe";
import { GL_FONT, TAP } from "./common";
import { useGlSymbols } from "../useGlSymbols";
import { LEG_RANK, LEG_REACH, nearestLeg, type GlLeg } from "../legTap";
import { CHART } from "../../../tokens";

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
  id: "candidates",
  type: "circle",
  source: CANDIDATES,
  paint: {
    "circle-radius": 4,
    "circle-color": ["get", "colour"],
    "circle-opacity": 0.5,
    "circle-stroke-color": CHART.fieldUnknown,
    "circle-stroke-width": 1,
    "circle-stroke-opacity": 0.65,
  },
};
/** A checkpoint's name beside its dot, on whichever side is clear, from
 *  NAME_ZOOM: MapLibre's collision, where useLabelled placed each by hand. */
const NAMES: SymbolLayerSpecification = {
  id: "checkpoint-names",
  type: "symbol",
  source: CHECKPOINT_SOURCE,
  minzoom: glZoom(NAME_ZOOM),
  layout: {
    "text-field": ["get", "name"],
    "text-font": GL_FONT,
    "text-size": 12,
    "text-variable-anchor": ["left", "right"],
    // Clear of its own dot's picture, which MapLibre's collision sees whole:
    // 16 points from its middle (markPictures' dotPicture, 26 across and 3
    // round it for the shadow). At 1.3 em (15.6) every name met its own dot
    // and none was drawn at any zoom.
    "text-radial-offset": 1.5,
    "text-justify": "auto",
    "symbol-sort-key": ["get", "number"],
  },
  paint: { "text-color": CHART.fixInk, "text-halo-color": CHART.casing, "text-halo-width": 2 },
};

/**
 * The route: the course line (a magenta core with a thin edge, and
 * the selected leg alone cased in green, as ForeFlight draws a selected
 * course; a tap on it the nearest leg's Route Leg sheet), its checkpoints numbered in flight
 * order and named closer in (a tap the checkpoint's card, the map flying
 * in to it), the points they were chosen from, and its departure, stops
 * and destination as every airport's mark on the chart, in its weather,
 * the ident on a dark pill (routeMarks; a tap its card).
 */
export function RouteGl({
  course,
  checkpoints,
  candidates,
  endpoints,
  legs = NO_LEGS,
  onSelectLeg,
  selectedLeg = null,
}: {
  course: Course | null;
  checkpoints: GlCheckpoint[];
  candidates: GlCandidate[];
  endpoints: GlEndpoint[];
  legs?: GlLeg[];
  onSelectLeg?: (key: string) => void;
  /** The leg whose Route Leg sheet is open: the only one cased in green. */
  selectedLeg?: string | null;
}) {
  const layers = useMemo(() => routeLayers(courseColour()), []);
  // The line in the route's slot, the marks over every mark on the chart.
  useGlLayer(
    "route",
    LINE_SOURCES,
    layers.filter((l) => "source" in l && l.source === ROUTE_SOURCE),
  );
  useGlLayer("top", MARK_SOURCES, [CANDIDATE_DOTS, NAMES]);
  // The casing follows the look, as the chart's paint does (ChartGl).
  const sunlight = useSunlight();
  const dark = useDarkTheme();
  const chartNight = usePreferences((s) => s.chartNight);
  const night = dark && chartNight === "dimmed";
  useGlPaint(["route-edge"], routeEdgePaint(night, sunlight));
  useGlPaint(["route-outer"], routeOuterPaint(night, sunlight));
  useGlPaint(["route-casing"], routeCasingPaint(night));
  // The green casing and the outer edge round it only along the selected
  // leg (the owner, 2026-11-09: ForeFlight shows the green outline only
  // when the course is selected): a filter, the source left as it is.
  const { map: glMap } = useGlMap();
  useEffect(() => {
    for (const id of ["route-casing", "route-outer"]) if (glMap.getLayer(id)) glMap.setFilter(id, selectedLegFilter(selectedLeg));
  }, [glMap, selectedLeg, course]);
  const line = useMemo(() => (course ? routeFeature(course.course_line as [number, number][], legs) : null), [course, legs]);
  useGlData(ROUTE_SOURCE, line);
  // The course drawn, for the browser tests.
  useGlProbe("route-line", ["route-core"], () => ({ course: true }));
  // Which leg is cased in green, for the browser tests.
  useGlProbe("route-casing", ["route-casing"], (f) => ({ leg: String(f.properties.leg) }));
  useGlProbe("candidate-marks", ["candidates"], (f) => ({ key: f.properties.key }));
  // The checkpoints' names the chart shows, those MapLibre placed clear of
  // each other (a name it could not fit is not drawn), for the tests.
  useGlProbe("checkpoint-names", [NAMES.id], (f) => ({ name: f.properties.name }));
  const dots = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: checkpoints.map((c) => ({
        type: "Feature",
        properties: { key: c.key, label: String(c.number), number: c.number, name: c.name, colour: c.colour },
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      })),
    }),
    [checkpoints],
  );
  useGlData(CHECKPOINT_SOURCE, dots);
  const others = useMemo(
    () => pointFeatures(candidates.map((c) => ({ key: c.key, lat: c.lat, lon: c.lon, label: "", colour: c.colour }))),
    [candidates],
  );
  useGlData(CANDIDATES, others);
  // The route's fields and its checkpoints as numbered dots, which give
  // way to each other by priority (routeMarks): a tap on a field its card,
  // on a checkpoint selects it and opens its card, the map flying in to it.
  const { openCard } = useGlMap();
  const marks = useMemo(
    () =>
      routeMarks(
        endpoints,
        checkpoints.map((c) => ({
          ...c,
          onTap: () => {
            c.select();
            openCard(c.card);
          },
        })),
      ),
    [endpoints, checkpoints, openCard],
  );
  useGlSymbols(ROUTE_MARKS, ROUTE_MARK_LAYERS, marks, { rank: TAP.rank.field });
  // A tap on the course within a finger's reach of it, nothing nearer
  // taken first (LEG_RANK), the nearest leg's sheet.
  const { map } = useGlMap();
  // Each leg's ends where they are on the screen, for the browser tests to
  // tap one, and to tap the chart clear of them (helpers' tapTheChart).
  useGlProbe("route-legs", ["route-edge"], () => ({
    legs: legs.map((l) => ({
      key: l.key,
      ends: [l.from, l.to].map((p) => map.project([p.lon, p.lat])).map((p) => [Math.round(p.x), Math.round(p.y)]),
    })),
  }));
  // The legs come in after the line is drawn, with nothing on the map to
  // draw again: a frame asked for, so the probe's next idle has them.
  useEffect(() => {
    map.triggerRepaint();
  }, [map, legs]);
  useGlTap(onSelectLeg ? ["route-edge"] : [], LEG_REACH, LEG_RANK, (_feature, event) => {
    const leg = nearestLeg(legs, event.point, (p) => map.project([p.lon, p.lat]));
    if (leg) onSelectLeg?.(leg.key);
  });
  useGlTap(["candidates"], 8, TAP.rank.checkpoint + 0.5, (feature) => {
    const c = candidates.find((p) => p.key === String(feature.properties.key));
    if (c?.select) c.select();
    else if (c?.card) openCard(c.card);
  });
  return null;
}
