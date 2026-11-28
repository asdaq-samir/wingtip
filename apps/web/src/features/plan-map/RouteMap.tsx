import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { chartQuery, classBQuery } from "../../lib/queryClient";
import { pointName } from "../../lib/identSchema";
import type { Candidate, Course, Leg, ProcedureDrawing } from "../../lib/api/types";
import { type BriefingState, type NavLogRow, type RouteLeg } from "../plan";
import { proceduresOf, sameField } from "../../lib/procedures";
import type { TrafficPattern } from "../../lib/trafficPattern";
import { chipColourOf } from "../../lib/map/marks/flightCategory";
import type { RouteWay } from "../../lib/map/route/routeWays";
import { checkpointColour } from "../../lib/map/marks/chartColors";
import { useInkLook } from "../../lib/brand";
import GlRouteMap, { type GlCandidate, type GlCheckpoint, type GlEndpoint, type GlLeg } from "./GlRouteMap";
import { usePreferences } from "../../lib/preferences";
import type { StopKind } from "../../lib/stopKinds";
import type { StopPin } from "../../lib/map/marks/stopPins";
import { scoreColor } from "../../lib/scoreScale";
import { useTerrainView } from "./terrain/useTerrainView";
import { useRouteAloft } from "./useRouteAloft";
import CheckpointCard from "./CheckpointCard";
import RoutePointCard from "./RoutePointCard";
import { PICK_ZOOM } from "../../lib/map/mapPick";
import { labelOf, legFactsOf, routeAirports, weatherOf } from "./routeMapFacts";
import { lonBounds } from "../../lib/geo";

const NO_PATTERNS: TrafficPattern[] = [];
const NO_POINTS: { lat: number; lon: number }[] = [];
const NO_POINTS_AT: { ident: string; lat: number; lon: number }[] = [];
const NO_STOP_FIELDS: StopFieldPin[] = [];
const NO_PROCEDURES: ProcedureDrawing[] = [];
const NO_CROSSINGS: Record<string, number> = {};
const NO_LEGS: RouteLeg[] = [];

/** A field of the map's Stops (StopsCard) pinned while the sheet is open:
 *  the kinds it has, in a row's order (lib/stopKinds). */
type StopFieldPin = { ident: string; lat: number; lon: number; kinds: StopKind[] };

interface Props {
  course: Course | null;
  candidates: Candidate[];
  selected: Candidate[];
  focus: { lat: number; lon: number } | null;
  /** A selected checkpoint marker's own half of row selection -- the
   *  sidebar list already focuses the map when a row is clicked; this
   *  is the other direction, clicking the marker itself. */
  onSelectCandidate: (candidate: Candidate) => void;
  /** The same for the two airports, which are not candidates but are
   *  waypoints the nav log lists and the map can be brought to. */
  onSelectPoint: (lat: number, lon: number) => void;
  /** The route's briefing (see `usePlan`): the departure and
   *  destination's own current METARs, and where fetching it stands. */
  airportWeather: BriefingState;
  /** The traffic patterns picked in the route's Procedures, to draw. */
  patterns?: TrafficPattern[];
  /** The one just picked ("KDLH:27:<when>"), for the map to go to it. */
  patternFocus?: string | null;
  /** The instrument procedures picked there, as the planner draws them. */
  procedures?: ProcedureDrawing[];
  /** The pilot's own altitudes to cross their fixes at, by fix; the fixes
   *  sent direct to ("KELD:I22:BXCMB", comma-joined); and a fix tapped,
   *  for its card (FixCard). */
  crossings?: Record<string, number>;
  directs?: string;
  onProcedureFix?: (field: string, kind: ProcedureDrawing["kind"], fix: string) => void;
  /** The one just picked ("KBUR:I08-Y:LAX@<when>"), for the map to go to
   *  it once it is drawn. */
  procedureFocus?: string | null;
  /** The airport whose card is open, and the way to open one from the
   *  chart (AirportsGl) -- or, with null, to put it away. */
  place: { ident: string; lat: number; lon: number } | null;
  /** The route's departure while it is all there is (no destination yet):
   *  the map brought to it (GlRouteMap's useGlFit), at the owner's screenshot. */
  start?: { ident: string; lat: number; lon: number } | null;
  /** The fields Nearest lists and own ship, with its card up: the map
   *  fitted to them over the half panel (GlRouteMap's useGlFit). */
  nearest?: { ident: string; lat: number; lon: number }[] | null;
  onSelectPlace: (ident: string | null) => void;
  /** The nav log's legs so far, for their tops of climb and descent. */
  legs: Leg[];
  /** The point whose airspace card is open, and the way to open one: a
   *  finger held on the chart, or a right-click. */
  heldPoint: { lat: number; lon: number } | null;
  onHoldPoint: (point: { lat: number; lon: number }) => void;
  /** The fuel stops the planner suggests (the totals' fuel_stops), pinned
   *  as Tesla pins its chargers on the way, a tap their field's card. */
  fuelStops?: StopPin[];
  /** The map's Stops while their sheet is open, with a route or none, a
   *  tap one's row picked in the sheet (StopsCard). */
  stopFields?: StopFieldPin[];
  onPickStopField?: (ident: string) => void;
  /** The ways FPL's Routes offer beside the route (WaysGl), a tap one's pick. */
  ways?: RouteWay[];
  /** The one of them shown (FPL's Routes' card picked), drawn the stronger. */
  wayShown?: string | null;
  onPickWay?: (key: string) => void;
  /** The route's legs, row to row of the nav log (routeLegs), a tap on
   *  the course opening the nearest one's sheet (RouteLegCard). */
  routeLegs?: RouteLeg[];
  onSelectLeg?: (key: string) => void;
  /** The leg whose Route Leg sheet is open (the only one cased in green). */
  selectedLeg?: string | null;
  /** The nav log's rows, for the route drawn at its altitudes in 3D
   *  (useRouteAloft). */
  routeRows?: NavLogRow[];
}

/**
 * The planned route on the chart, on MapLibre's one WebGL map
 * (lib/map/gl, GlRouteMap): the chart, the chart's own airports made
 * tappable, the route's, the checkpoints, the selection ring, own ship,
 * every layer over them. Here the page's state is turned into what the
 * map draws -- each checkpoint's card, each airport's weather -- and the
 * map itself is GlRouteMap's.
 */
// Drawn again only when its own props change (memo): the workspace
// renders at each answer that streams in, and the whole map went with it.
export default memo(function RouteMap({
  course,
  candidates,
  selected,
  focus,
  onSelectCandidate,
  onSelectPoint,
  airportWeather,
  place,
  start = null,
  onSelectPlace,
  legs,
  heldPoint,
  onHoldPoint,
  nearest = null,
  patterns = NO_PATTERNS,
  patternFocus = null,
  procedures = NO_PROCEDURES,
  procedureFocus = null,
  crossings = NO_CROSSINGS,
  directs = "",
  onProcedureFix,
  fuelStops = NO_POINTS_AT,
  stopFields = NO_STOP_FIELDS,
  onPickStopField,
  ways,
  wayShown = null,
  onPickWay,
  routeLegs = NO_LEGS,
  onSelectLeg,
  selectedLeg,
  routeRows,
}: Props) {
  // A point picked comes in as an airport's card brings its field (one
  // rule, rules.md §14), not to the chart's last zoom.
  const focusZoom = PICK_ZOOM;
  // The pattern just picked, its corners and its entry, to bring in.
  const focusedPattern = useMemo(() => {
    const [ident, end] = (patternFocus ?? "").split(":");
    const p = patterns.find((q) => q.ident === ident && q.runway === end);
    return p ? [...p.legs.flatMap((l) => [l.from, l.to]), p.entry.from, p.entry.to] : NO_POINTS;
  }, [patterns, patternFocus]);
  // The procedure just picked, every line and hold of it, to bring in.
  const focusedProcedure = useMemo(() => {
    const picked = proceduresOf((procedureFocus ?? "").split("@")[0] ?? null)[0];
    const d =
      picked && procedures.find((q) => sameField(q.airport, picked.ident) && q.id === picked.id && q.transition === picked.transition);
    return d ? [...d.lines, ...d.holds].flatMap((l) => l.points.map(([lat, lon]) => ({ lat, lon }))) : NO_POINTS;
  }, [procedures, procedureFocus]);
  // The route's airports, one array while the course is the same answer.
  const airports = useMemo(() => (course ? routeAirports(course) : []), [course]);
  // The fields that wear a chip of their own already: the route's own,
  // the Class B ones, always drawn (ClassBGl), and the Stops' and the fuel
  // stops' while they are pinned (StopMarksGl): the tile layer leaves each
  // out, so no field's ident is drawn twice.
  const { data: classBAirports } = useQuery({ ...classBQuery, enabled: false });
  const chippedFields = useMemo(
    () => [...airports.filter((a) => a.kind === "airport"), ...(classBAirports ?? []), ...stopFields, ...fuelStops],
    [airports, classBAirports, stopFields, fuelStops],
  );
  // And the route's waypoints, which the VFR waypoints' layer leaves to it.
  const chipped = useMemo(() => new Set([...airports, ...chippedFields].map((a) => a.ident)), [airports, chippedFields]);

  // The route's box, half a degree round it, on the half-degree grid the
  // layer asks in: one question for its reporting fields however the
  // course is answered again.
  const routeBox = useMemo(() => {
    if (!course) return null;
    const lats = course.course_line.map((p) => p[0]),
      lons = course.course_line.map((p) => p[1]);
    const out = (v: number, up: boolean) => (up ? Math.ceil(v * 2) : Math.floor(v * 2)) / 2;
    // The planner's box takes -180 to 180, west under east: a course across
    // or near the antimeridian asks the whole band of longitude rather than
    // a 422 (west -180.5, or west past east), its fields then all in it.
    const [w, e] = lonBounds(lons);
    const across = w - 0.5 < -180 || e + 0.5 > 180;
    return {
      south: out(Math.min(...lats) - 0.5, false),
      north: out(Math.max(...lats) + 0.5, true),
      west: across ? -180 : out(w - 0.5, false),
      east: across ? 180 : out(e + 0.5, true),
    };
  }, [course]);

  // The course and the plan's first cruise, for a weather area's card.
  const courseLine = (course?.course_line as [number, number][] | undefined) ?? null;
  const cruiseFt = legs[0]?.altitude_ft ?? null;
  // The route at its altitudes, in 3D only.
  const aloft = useRouteAloft(useTerrainView().mode, routeRows, courseLine);

  // The chosen checkpoints and the candidates they were chosen from, at
  // every zoom, or neither: the route's ••• menu's Checkpoints. Their dots in
  // their scores' colours, or the Chart ink look's brown
  // (checkpointColour), each with the card a tap opens.
  const showCheckpoints = usePreferences((s) => s.waypoints);
  const ink = useInkLook();
  const legFacts = useMemo(() => legFactsOf(selected, legs), [selected, legs]);
  const glCheckpoints = useMemo<GlCheckpoint[]>(
    () =>
      !showCheckpoints
        ? []
        : selected.map((c, i) => {
            const key = `${c.lat},${c.lon}`;
            return {
              key,
              lat: c.lat,
              lon: c.lon,
              number: i + 1,
              name: labelOf(c),
              colour: checkpointColour(scoreColor(c.predicted_score), ink),
              card: <CheckpointCard candidate={c} number={i + 1} leg={legFacts.get(key)} />,
              select: () => onSelectCandidate(c),
            };
          }),
    [showCheckpoints, selected, ink, legFacts, onSelectCandidate],
  );
  const glCandidates = useMemo<GlCandidate[]>(
    () =>
      !showCheckpoints
        ? []
        : candidates
            .filter((c) => !c.selected)
            .map((c) => ({
              key: `${c.lat},${c.lon}`,
              lat: c.lat,
              lon: c.lon,
              colour: scoreColor(c.predicted_score),
              card: <CheckpointCard candidate={c} />,
            })),
    [showCheckpoints, candidates],
  );
  // The route's departure, stops and destination, drawn at every zoom: an
  // airport's mark in its class of airspace's look, its dot the field's
  // own current METAR's colour, a tap its card; a waypoint flown through
  // its ringed dot and name (rules.md §10), a tap its card (RoutePointCard)
  // and its ring, the map brought to it.
  const glEndpoints = useMemo<GlEndpoint[]>(
    () =>
      !course
        ? []
        : routeAirports(course).map((a) => ({
            ident: a.kind === "fix" ? pointName(a.ident) : a.ident,
            lat: a.lat,
            lon: a.lon,
            fix: a.kind === "fix",
            space: a.airspace_class ?? (classBAirports?.some((b) => b.ident === a.ident) ? "B" : null),
            colour: chipColourOf(weatherOf(a.ident, airportWeather)),
            select: () => (a.kind === "fix" ? onSelectPoint(a.lat, a.lon) : onSelectPlace(a.ident)),
            // A point flown through opens its card, as a field opens its own.
            card:
              a.kind === "fix" ? (
                <RoutePointCard key={`${a.ident}@${a.lat},${a.lon}`} name={pointName(a.ident)} kind="Route point" lat={a.lat} lon={a.lon} />
              ) : undefined,
          })),
    [course, airportWeather, onSelectPoint, onSelectPlace, classBAirports],
  );
  // The legs' ends, for the tap on the course to find the nearest leg.
  const glLegs = useMemo<GlLeg[]>(() => routeLegs.map((l) => ({ key: l.key, from: l.from, to: l.to })), [routeLegs]);
  // The chart alone while there is no route, for the Class B chips' sheets.
  const { data: chartOnly } = useQuery({ ...chartQuery, enabled: !course });

  return (
    <GlRouteMap
      course={course}
      chart={course ?? chartOnly ?? null}
      checkpoints={glCheckpoints}
      candidates={glCandidates}
      endpoints={glEndpoints}
      focus={focus}
      focusZoom={focusZoom}
      place={place}
      onSelectPlace={onSelectPlace}
      onSelectPoint={onSelectPoint}
      chipped={chippedFields}
      routeBox={routeBox}
      briefing={airportWeather}
      chippedIdents={chipped}
      courseLine={courseLine}
      cruiseFt={cruiseFt}
      legs={legs}
      start={start}
      nearest={nearest}
      heldPoint={heldPoint}
      onHoldPoint={onHoldPoint}
      patterns={patterns}
      focusedPattern={focusedPattern}
      patternFocus={patternFocus}
      procedures={procedures}
      focusedProcedure={focusedProcedure}
      procedureFocus={procedureFocus}
      crossings={crossings}
      directs={directs}
      onProcedureFix={onProcedureFix}
      fuelStops={fuelStops}
      stopFields={stopFields}
      onPickStopField={onPickStopField}
      ways={ways}
      wayShown={wayShown}
      onPickWay={onPickWay}
      routeLegs={glLegs}
      onSelectLeg={onSelectLeg}
      selectedLeg={selectedLeg}
      aloft={aloft}
    />
  );
});

// The map drawn before the engine is there (MapPage), on this chunk too.
export { GlBootMap as BootMap } from "./GlRouteMap";
