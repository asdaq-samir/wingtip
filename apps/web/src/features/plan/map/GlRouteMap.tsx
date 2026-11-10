import { Suspense, lazy, useState } from "react";
import type { ChartInfo, Course, Leg, ProcedureDrawing } from "../../../lib/api/types";
import type { StopKind } from "../../../lib/stopKinds";
import type { TrafficPattern } from "../../../lib/trafficPattern";
import { DRY_RUN, usePastFlight } from "./pastFlight";
import type { RouteWay } from "../../../lib/map/route/routeWays";
import type { StopPin } from "../../../lib/map/marks/stopPins";
import GlMapShell from "../../../components/map/GlMapShell";
import { AirportsGl } from "./layers/AirportsGl";
import { AirspaceGl } from "../../../components/map/layers/AirspaceGl";
import { LandWaterGl, OverlayGl } from "../../../lib/map/gl/layers/BaseGl";
import { ChartGl } from "../../../lib/map/gl/layers/ChartGl";
import { EmergencyGl } from "./layers/EmergencyGl";
import { GlideRingGl } from "./layers/GlideRingGl";
import { AheadGl, ClassBGl } from "./layers/MarksGl";
import { NavaidsGl, WaypointsGl } from "../../../components/map/layers/NavaidsGl";
import { OwnShipGl } from "../../../lib/map/gl/layers/OwnShipGl";
import {
  FuelStopsGl,
  HoldTracksGl,
  LegPointsGl,
  LessonGl,
  PatternsGl,
  PickedGl,
  PlatesGl,
  ProceduresGl,
  StopFieldsGl,
  WaysGl,
} from "../../../lib/map/gl/layers/RouteExtrasGl";
import { RouteGl, type GlCandidate, type GlCheckpoint, type GlEndpoint } from "../../../lib/map/gl/layers/RouteGl";
import type { GlLeg } from "../../../lib/map/gl/legTap";
import { TfrGl } from "./layers/TfrGl";
import { FlownTrackGl, LegHighlightGl, OwnTrailGl, ReplayGl } from "./layers/TracksGl";
import { ForecastRunGl } from "../forecastRun/ForecastRunGl";
import { TrafficGl } from "./layers/TrafficGl";
import { WeatherGl } from "./layers/WeatherGl";
import { WeatherLoopGl } from "../../weather-loop";
import { useWeatherLayers } from "../../../lib/map/sources/weatherLayers";
import { useGlFit } from "./useGlFit";
import type { AloftPoint } from "./terrain/geometry";
import { useTerrainView } from "./terrain/useTerrainView";

/** The relief, the 3D ground and the pilot's-eye view (features/plan/map/terrain):
 *  a chunk of its own, loaded only once the Map menu's Terrain or the dry
 *  run asks for it. */
const TerrainGl = lazy(() => import("./terrain/TerrainGl"));

export type { GlCandidate, GlCheckpoint, GlEndpoint, GlLeg };

type Point = { ident: string; lat: number; lon: number };
const NONE: { lat: number; lon: number }[] = [];

interface GlRouteMapProps {
  course: Course | null;
  /** The chart alone while there is no route. */
  chart: ChartInfo | null;
  checkpoints: GlCheckpoint[];
  candidates: GlCandidate[];
  endpoints: GlEndpoint[];
  focus: { lat: number; lon: number } | null;
  focusZoom: number;
  /** The airport whose card is open, and the way to open one. */
  place: Point | null;
  onSelectPlace: (ident: string | null) => void;
  onSelectPoint: (lat: number, lon: number) => void;
  /** The fields that wear a chip of their own: the route's. */
  chipped: Point[];
  /** The route's box, for its reporting fields. */
  routeBox: { south: number; west: number; north: number; east: number } | null;
  /** The idents the route and its chips draw, which the waypoints leave to them. */
  chippedIdents: Set<string>;
  /** The course and the plan's first cruise, for a weather area's card. */
  courseLine: [number, number][] | null;
  cruiseFt: number | null;
  legs: Leg[];
  start: Point | null;
  nearest: Point[] | null;
  heldPoint: { lat: number; lon: number } | null;
  onHoldPoint: (point: { lat: number; lon: number }) => void;
  patterns: TrafficPattern[];
  focusedPattern: { lat: number; lon: number }[];
  patternFocus: string | null;
  procedures: ProcedureDrawing[];
  focusedProcedure: { lat: number; lon: number }[];
  procedureFocus: string | null;
  procedureCover?: { top: number; bottom: number };
  crossings: Record<string, number>;
  directs: string;
  onProcedureFix?: (field: string, kind: ProcedureDrawing["kind"], fix: string) => void;
  fuelStops: StopPin[];
  stopFields: { ident: string; lat: number; lon: number; kinds: StopKind[] }[];
  onPickStopField?: (ident: string) => void;
  ways?: RouteWay[];
  wayShown: string | null;
  onPickWay?: (key: string) => void;
  /** The route's legs, a tap on the course the nearest one's. */
  routeLegs?: GlLeg[];
  onSelectLeg?: (key: string) => void;
  /** The leg whose sheet is open, cased in green. */
  selectedLeg?: string | null;
  /** The route at the plan's altitudes, drawn in the air in 3D. */
  aloft?: AloftPoint[] | null;
}

/**
 * The planner's map: every layer it draws, each a component of
 * lib/map/gl/layers on the one WebGL map (RouteMap gives it the page's state).
 */
export default function GlRouteMap(p: GlRouteMapProps) {
  const { course } = p;
  return (
    <GlMapShell course={course} focus={p.focus} focusZoom={p.focusZoom} place={p.place}>
      <Layers {...p} />
    </GlMapShell>
  );
}

/**
 * The map before the engine is there (MapPage's engine gate): the chart
 * and the cycle's overlays from their tiles, which ask it nothing, drawn
 * while the .wasm comes; no taps, cards, buttons or route, which do. The
 * planner's map takes this one up as it comes (GlMapShell's park), the
 * chart and the overlays as they are.
 */
export function GlBootMap() {
  return (
    <GlMapShell bare course={null} focus={null} focusZoom={0} place={null}>
      <LandWaterGl />
      <ChartGl course={null} />
      <OverlayGl />
    </GlMapShell>
  );
}

function Layers(p: GlRouteMapProps) {
  const { course } = p;
  const dryRunning = usePastFlight((s) => s.hex === DRY_RUN);
  const [previewing, setPreviewing] = useState(false);
  // The map fitted to what was just picked: a lone departure,
  // Nearest's fields, the Stops, a procedure or a pattern just picked.
  useGlFit(p.start ? [p.start] : NONE, !p.place ? (p.start?.ident ?? null) : null, 9);
  useGlFit(p.nearest ?? NONE, !p.place && p.nearest?.length ? p.nearest.map((a) => a.ident).join(",") : null);
  useGlFit(p.stopFields, p.stopFields.length ? `stops:${p.stopFields.map((f) => f.ident).join(",")}` : null);
  useGlFit(p.focusedProcedure, p.focusedProcedure.length ? p.procedureFocus : null, 12, p.procedureCover);
  useGlFit(p.focusedPattern, p.focusedPattern.length ? p.patternFocus : null, 13);
  const route = course ? [course.departure.ident, ...(course.stops ?? []).map((s) => s.ident), course.destination.ident] : [];
  const terrain = useTerrainView();
  // The radar and satellite loop under the advisories, while one is on.
  const loop = useWeatherLayers((s) => s.loop !== "off");
  return (
    <>
      <LandWaterGl />
      <ChartGl course={course} previewing={previewing} />
      {terrain.mode !== "flat" && (
        <Suspense fallback={null}>
          <TerrainGl mode={terrain.mode} pilot={terrain.pilot} aloft={course ? (p.aloft ?? null) : null} />
        </Suspense>
      )}
      <OverlayGl />
      {loop && <WeatherLoopGl />}
      <WeatherGl line={p.courseLine} altitudeFt={p.cruiseFt} />
      <TfrGl />
      <AirspaceGl />
      <NavaidsGl />
      <WaypointsGl exclude={p.chippedIdents} />
      <AirportsGl selected={p.place} onSelect={p.onSelectPlace} others={p.chipped} route={p.routeBox} />
      {p.chart && <ClassBGl chart={p.chart} route={route} onPreview={setPreviewing} onSelectPlace={p.onSelectPlace} />}
      <StopFieldsGl fields={p.stopFields} onSelect={p.onPickStopField ?? p.onSelectPlace} />
      {course && (
        <>
          {p.onPickWay && p.ways && <WaysGl ways={p.ways} shown={p.wayShown} onPick={p.onPickWay} />}
          <LegHighlightGl course={course} />
          <PlatesGl drawings={p.procedures} />
          <RouteGl
            course={course}
            checkpoints={p.checkpoints}
            candidates={p.candidates}
            endpoints={p.endpoints}
            legs={p.routeLegs}
            onSelectLeg={p.onSelectLeg}
            selectedLeg={p.selectedLeg}
          />
          <FuelStopsGl stops={p.fuelStops} onSelect={p.onSelectPlace} />
          <FlownTrackGl course={course} />
          {dryRunning && <ReplayGl asOwnShip />}
          {dryRunning && <ForecastRunGl />}
          <PatternsGl patterns={p.patterns} />
          <ProceduresGl drawings={p.procedures} crossings={p.crossings} directs={p.directs} onFix={p.onProcedureFix} />
          <LessonGl />
          <LegPointsGl legs={p.legs} onSelectPoint={p.onSelectPoint} />
          <HoldTracksGl legs={p.legs} />
        </>
      )}
      <PickedGl focus={p.focus} held={p.heldPoint} onHold={p.onHoldPoint} />
      <OwnTrailGl />
      {/* The emergency assistant's glide ring and line (features/emergency). */}
      <EmergencyGl />
      {/* The glide ring the pilot turned on in the Map menu, none in an emergency (EmergencyGl's then). */}
      <GlideRingGl />
      <OwnShipGl />
      <AheadGl />
      <TrafficGl />
    </>
  );
}
