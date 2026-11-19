import { Suspense, lazy, useMemo } from "react";
import type { ChartInfo, Course, Leg, ProcedureDrawing } from "../../lib/api/types";
import type { StopKind } from "../../lib/stopKinds";
import type { TrafficPattern } from "../../lib/trafficPattern";
import { DRY_RUN, usePastFlight, type BriefingState } from "../plan";
import type { RouteWay } from "../../lib/map/route/routeWays";
import type { StopPin } from "../../lib/map/marks/stopPins";
import GlMapShell from "../../components/map/GlMapShell";
import { EngineGate } from "../../lib/engine/engineGate";
import { AirportsGl } from "./layers/AirportsGl";
import { useWorseByArrival } from "./worseByArrival";
import { AirspaceGl } from "../../components/map/layers/AirspaceGl";
import { LandWaterGl, OverlayGl } from "../../lib/map/gl/layers/BaseGl";
import { ChartGl } from "../../lib/map/gl/layers/ChartGl";
import { EmergencyGl } from "./layers/EmergencyGl";
import { GlideRingGl } from "./layers/GlideRingGl";
import { AheadGl } from "./layers/MarksGl";
import { ClassBGl } from "../../lib/map/gl/layers/ClassBGl";
import { NavaidsGl, WaypointsGl } from "../../components/map/layers/NavaidsGl";
import { OwnShipGl } from "../../lib/map/gl/layers/OwnShipGl";
import { HoldTracksGl, LegPointsGl, PatternsGl, PickedGl, ProceduresGl } from "../../lib/map/gl/layers/RouteExtrasGl";
import { WaysGl } from "../../lib/map/gl/layers/WaysGl";
import { MapCentreGl } from "../../lib/map/mapCentre";
import { LessonGl } from "../../lib/map/gl/layers/LessonGl";
import { FuelStopsGl, StopFieldsGl } from "../../lib/map/gl/layers/StopMarksGl";
import { RouteGl, type GlCandidate, type GlCheckpoint, type GlEndpoint } from "../../lib/map/gl/layers/RouteGl";
import type { GlLeg } from "../../lib/map/gl/legTap";
import { TfrGl } from "./layers/TfrGl";
import { SearchResultsGl } from "./layers/SearchResultsGl";
import { FlownTrackGl, LegHighlightGl, LegHoverGl, OwnTrailGl, ReplayGl } from "./layers/TracksGl";
import { ForecastRunGl } from "./forecastRun/ForecastRunGl";
import { TrafficGl } from "./layers/TrafficGl";
import { WeatherGl } from "./layers/WeatherGl";
import { WeatherLoopGl } from "../weather-loop";
import { FlowGl } from "../weather-flow";
import { PlatesGl, usePlateTagged } from "../plates";
import { FaaChart } from "../../components/AirportDiagram";
import { useWeatherLayers } from "../../lib/map/sources/weatherLayers";
import { usePreferences } from "../../lib/preferences";
import { useGlFit } from "./useGlFit";
import type { AloftPoint } from "./terrain/geometry";
import { useTerrainView } from "./terrain/useTerrainView";
import ReliefGl from "./terrain/ReliefGl";
import { coursePoints } from "../../lib/course";
import { useRouteOnly } from "../../lib/map/routeOnly";
import { useLineFocus } from "./useLineFocus";
import RoutePointCard from "./RoutePointCard";
import { useStopsAlong } from "../stops";
import { OwnShipCard } from "../../components/map/cards/OwnShipCard";

/** A top of climb's or descent's card (LegPointsGl's tap). */
const legPointCard = (words: "TOC" | "TOD", at: { lat: number; lon: number }) => (
  <RoutePointCard key={`${words}@${at.lat},${at.lon}`} name={words} kind={words === "TOC" ? "Top of climb" : "Top of descent"} {...at} />
);

/** Own ship's card, a tap on it (OwnShipGl), as Maps' My Location's. */
const OWN_SHIP_CARD = <OwnShipCard />;

/** No checkpoints, while the map shows the route's points alone. */
const NO_CHECKPOINTS: GlCheckpoint[] = [];

/** The 3D ground and the pilot's-eye view (features/plan-map/terrain): a
 *  chunk of its own, deck.gl with it, loaded only once 3D is on; the
 *  relief shaded under the 2D chart is the map's own (ReliefGl), since
 *  the owner took Flat out (2026-11-13) and loading this chunk for it
 *  fetched deck.gl at every open (PERF-2). */
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
  // The chart and the cycle's overlays from their tiles, which ask the
  // engine nothing, at once; every layer that works out a figure or a
  // colour with it (the fields' flight categories, the glide ring, the
  // traffic) once it is there (MapPage, lib/engine/engineGate). Each layer
  // has its slot (lib/map/gl/glLayer), so one added later is drawn where
  // it always is.
  return (
    <>
      <LandWaterGl />
      <ChartGl course={course} />
      <OverlayGl />
      <EngineGate>
        <EngineLayers {...p} />
      </EngineGate>
    </>
  );
}

/** The layers the engine works out a figure or a colour for, and the
 *  map's fits to what is picked: drawn once it is there (Layers). */
function EngineLayers(p: GlRouteMapProps) {
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
  const route = course ? coursePoints(course).map((p) => p.ident) : [];
  // The Stops' field picked on the chart, ringed as a field whose card is
  // open is (the owner, 2026-11-18): its row picked in the Stops card too.
  const pickedStop = useStopsAlong((s) => s.picked);
  const stopPicked = useMemo(() => p.stopFields.find((f) => f.ident === pickedStop) ?? null, [p.stopFields, pickedStop]);
  const worse = useWorseByArrival(p.briefing, course);
  const terrain = useTerrainView();
  // The weather picked, only while the Map card's Weather is on (the
  // owner, 2026-11-14): the radar and satellite loop under the advisories,
  // and the model weather's flow layer, its own chunk.
  // The route's points alone while a line of FPL's timeline is open (routeOnly), its point centred.
  const routeOnly = useRouteOnly((s) => s.on);
  // Which approaches their plates tag, so a fix is tagged once.
  const plated = usePlateTagged();
  useLineFocus(course);
  const weather = usePreferences((s) => s.weather) && !routeOnly;
  const loop = useWeatherLayers((s) => s.loop !== "off") && weather;
  const flow = useWeatherLayers((s) => s.flow !== "off") && weather;
  return (
    <>
      <ReliefGl />
      {terrain.mode === "3d" && (
        <Suspense fallback={null}>
          <TerrainGl
            mode={terrain.mode}
            pilot={terrain.pilot}
            aloft={course ? (p.aloft ?? null) : null}
            field={p.place?.ident ?? course?.destination.ident ?? null}
            procedures={p.procedures}
          />
        </Suspense>
      )}
      {loop && <WeatherLoopGl />}
      {flow && (
        <Suspense fallback={null}>
          <FlowGl />
        </Suspense>
      )}
      {weather && <WeatherGl line={p.courseLine} altitudeFt={p.cruiseFt} />}
      <TfrGl />
      <MapCentreGl />
      {/* A search sent, its fields marked (the one search's results). */}
      {!routeOnly && (
        <>
          <SearchResultsGl />
          <AirspaceGl />
          <NavaidsGl />
          <WaypointsGl exclude={p.chippedIdents} />
        </>
      )}
      <AirportsGl selected={p.place} picked={stopPicked} onSelect={p.onSelectPlace} others={p.chipped} route={p.routeBox} worse={worse} />
      {p.chart && !routeOnly && <ClassBGl chart={p.chart} route={route} onSelectPlace={p.onSelectPlace} />}
      {!routeOnly && <StopFieldsGl fields={p.stopFields} onSelect={p.onPickStopField ?? p.onSelectPlace} />}
      {course && (
        <>
          {p.onPickWay && p.ways && !routeOnly && <WaysGl ways={p.ways} shown={p.wayShown} onPick={p.onPickWay} />}
          <LegHighlightGl course={course} />
          <LegHoverGl />
          <PlatesGl drawings={p.procedures} viewer={FaaChart} />
          <RouteGl
            course={course}
            checkpoints={routeOnly ? NO_CHECKPOINTS : p.checkpoints}
            candidates={p.candidates}
            endpoints={p.endpoints}
            legs={p.routeLegs}
            onSelectLeg={p.onSelectLeg}
            selectedLeg={p.selectedLeg}
          />
          {!routeOnly && <FuelStopsGl stops={p.fuelStops} onSelect={p.onSelectPlace} />}
          <FlownTrackGl course={course} />
          {dryRunning && <ReplayGl asOwnShip />}
          {dryRunning && <ForecastRunGl />}
          <PatternsGl patterns={p.patterns} />
          <ProceduresGl drawings={p.procedures} crossings={p.crossings} directs={p.directs} plated={plated} onFix={p.onProcedureFix} />
          <LessonGl />
          <LegPointsGl legs={p.legs} onSelectPoint={p.onSelectPoint} cardOf={legPointCard} />
          <HoldTracksGl legs={p.legs} />
        </>
      )}
      <PickedGl focus={p.focus} held={p.heldPoint} onHold={p.onHoldPoint} />
      <OwnTrailGl />
      {/* The emergency assistant's glide ring and line (features/emergency). */}
      <EmergencyGl />
      {/* The glide ring the pilot turned on in the Map menu, none in an emergency (EmergencyGl's then). */}
      <GlideRingGl />
      <OwnShipGl card={OWN_SHIP_CARD} />
      <AheadGl />
      {!routeOnly && <TrafficGl />}
    </>
  );
}
