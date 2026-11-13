import { Suspense, lazy, useState } from "react";
import type { ChartInfo, Course, Leg, ProcedureDrawing } from "../../../lib/api/types";
import type { StopKind } from "../../../lib/stopKinds";
import type { TrafficPattern } from "../../../lib/trafficPattern";
import { DRY_RUN, usePastFlight } from "./pastFlight";
import type { RouteWay } from "../../../lib/map/route/routeWays";
import type { StopPin } from "../../../lib/map/marks/stopPins";
import GlMapShell from "../../../components/map/GlMapShell";
import { EngineGate } from "../../../lib/engine/engineGate";
import { AirportsGl } from "./layers/AirportsGl";
import { useWorseByArrival } from "./worseByArrival";
import type { BriefingState } from "../hooks/usePlan";
import { AirspaceGl } from "../../../components/map/layers/AirspaceGl";
import { LandWaterGl, OverlayGl } from "../../../lib/map/gl/layers/BaseGl";
import { ChartGl } from "../../../lib/map/gl/layers/ChartGl";
import { EmergencyGl } from "./layers/EmergencyGl";
import { GlideRingGl } from "./layers/GlideRingGl";
import { AheadGl } from "./layers/MarksGl";
import { ClassBGl } from "../../../lib/map/gl/layers/ClassBGl";
import { NavaidsGl, WaypointsGl } from "../../../components/map/layers/NavaidsGl";
import { OwnShipGl } from "../../../lib/map/gl/layers/OwnShipGl";
import { HoldTracksGl, LegPointsGl, PatternsGl, PickedGl, ProceduresGl, WaysGl } from "../../../lib/map/gl/layers/RouteExtrasGl";
import { LessonGl } from "../../../lib/map/gl/layers/LessonGl";
import { FuelStopsGl, StopFieldsGl } from "../../../lib/map/gl/layers/StopMarksGl";
import { RouteGl, type GlCandidate, type GlCheckpoint, type GlEndpoint } from "../../../lib/map/gl/layers/RouteGl";
import type { GlLeg } from "../../../lib/map/gl/legTap";
import { TfrGl } from "./layers/TfrGl";
import { SearchResultsGl } from "./layers/SearchResultsGl";
import { FlownTrackGl, LegHighlightGl, LegHoverGl, OwnTrailGl, ReplayGl } from "./layers/TracksGl";
import { ForecastRunGl } from "../forecastRun/ForecastRunGl";
import { TrafficGl } from "./layers/TrafficGl";
import { WeatherGl } from "./layers/WeatherGl";
import { WeatherLoopGl } from "../../weather-loop";
import { FlowGl } from "../../weather-flow";
import { PlatesGl } from "../../plates";
import { FaaChart } from "../components/AirportDiagram";
import { useWeatherLayers } from "../../../lib/map/sources/weatherLayers";
import { useGlFit } from "./useGlFit";
import type { AloftPoint } from "./terrain/geometry";
import { useTerrainView } from "./terrain/useTerrainView";

/** The relief, the 3D ground and the pilot's-eye view (features/plan/map/terrain):
 *  a chunk of its own, loaded after the map's first script; the relief is
 *  always shaded under the 2D chart since the owner took Flat out
 *  (2026-11-13). */
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
  /** The route's briefing, for its fields whose weather gets worse by
   *  the pilot's time there (useWorseByArrival). */
  briefing: BriefingState;
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
 * The map alone, while a route named in the address waits for the engine
 * to read it (MapPage's Suspense): the chart and the cycle's overlays
 * from their tiles, which ask it nothing; no taps, cards, buttons or
 * route, which do. The
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
  const [previewing, setPreviewing] = useState(false);
  // The chart and the cycle's overlays from their tiles, which ask the
  // engine nothing, at once; every layer that works out a figure or a
  // colour with it (the fields' flight categories, the glide ring, the
  // traffic) once it is there (MapPage, lib/engine/engineGate). Each layer
  // has its slot (lib/map/gl/glLayer), so one added later is drawn where
  // it always is.
  return (
    <>
      <LandWaterGl />
      <ChartGl course={course} previewing={previewing} />
      <OverlayGl />
      <EngineGate>
        <EngineLayers {...p} onPreview={setPreviewing} />
      </EngineGate>
    </>
  );
}

/** The layers the engine works out a figure or a colour for, and the
 *  map's fits to what is picked: drawn once it is there (Layers). */
function EngineLayers(p: GlRouteMapProps & { onPreview: (on: boolean) => void }) {
  const { course } = p;
  const dryRunning = usePastFlight((s) => s.hex === DRY_RUN);
  // The map fitted to what was just picked, once a pick: a lone
  // departure, Nearest opened, the Stops, a procedure or a pattern just
  // picked. Not again as their points change (useGlFit), and not where
  // the airport's card a pick opened flies the map itself (GlMapShell).
  const placed = !!p.place;
  useGlFit(p.start ? [p.start] : NONE, p.start?.ident ?? null, 9, undefined, placed);
  useGlFit(p.nearest ?? NONE, p.nearest ? "nearest" : null, undefined, undefined, placed);
  useGlFit(p.stopFields, p.stopFields.length ? "stops" : null);
  // Framed clear of the sheet as it really is: the map's insets (the
  // Drawer's own cover, useSheetCover) are its padding already.
  useGlFit(p.focusedProcedure, p.focusedProcedure.length ? p.procedureFocus : null, 12);
  useGlFit(p.focusedPattern, p.focusedPattern.length ? p.patternFocus : null, 13);
  const route = course ? [course.departure.ident, ...(course.stops ?? []).map((s) => s.ident), course.destination.ident] : [];
  const worse = useWorseByArrival(p.briefing, course);
  const terrain = useTerrainView();
  // The radar and satellite loop under the advisories, while one is on.
  const loop = useWeatherLayers((s) => s.loop !== "off");
  // The model weather's flow layer, its own chunk, while a field is picked.
  const flow = useWeatherLayers((s) => s.flow !== "off");
  return (
    <>
      <Suspense fallback={null}>
        <TerrainGl
          mode={terrain.mode}
          pilot={terrain.pilot}
          aloft={course ? (p.aloft ?? null) : null}
          field={p.place?.ident ?? course?.destination.ident ?? null}
          procedures={p.procedures}
        />
      </Suspense>
      {loop && <WeatherLoopGl />}
      {flow && (
        <Suspense fallback={null}>
          <FlowGl />
        </Suspense>
      )}
      <WeatherGl line={p.courseLine} altitudeFt={p.cruiseFt} />
      <TfrGl />
      {/* A search sent, its fields marked (the one search's results). */}
      <SearchResultsGl />
      <AirspaceGl />
      <NavaidsGl />
      <WaypointsGl exclude={p.chippedIdents} />
      <AirportsGl selected={p.place} onSelect={p.onSelectPlace} others={p.chipped} route={p.routeBox} worse={worse} />
      {p.chart && <ClassBGl chart={p.chart} route={route} onPreview={p.onPreview} onSelectPlace={p.onSelectPlace} />}
      <StopFieldsGl fields={p.stopFields} onSelect={p.onPickStopField ?? p.onSelectPlace} />
      {course && (
        <>
          {p.onPickWay && p.ways && <WaysGl ways={p.ways} shown={p.wayShown} onPick={p.onPickWay} />}
          <LegHighlightGl course={course} />
          <LegHoverGl />
          <PlatesGl drawings={p.procedures} viewer={FaaChart} />
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
