import type { AircraftProfile } from "../../lib/api/types";
import type { BranchFix, PickedProcedure } from "../../lib/procedures";
import type { Hold, NavLogRow, ProcedureAirport, ProcedureKind } from "../plan";
import type { PointAltitude } from "../route";
import type { RouteLineChoices } from "./RouteLine";

type Kind = ProcedureKind;

/** The route changed on FPL's timeline (decision 0047), by the points'
 *  places in `routePoints`. */
interface RouteListEdit {
  /** A point dragged by its grip (or held) onto another's place. */
  onMove: (from: number, to: number) => void;
  /** Whether that move may be made (useRouteListEdit's movedRoute). */
  canMove: (from: number, to: number) => boolean;
  /** Whether the list offers a drop there: a move that may be made, or
   *  one refused with a reason to say (moveRefusal). */
  canDrop: (from: number, to: number) => boolean;
  /** The last move refused, by the place of the point carried, and why
   *  ("My Location can only start or end the route."), said under it. */
  refusal: { index: number; note: string } | null;
  /** A stop asked of the one search, put in at this place. */
  onAddAt: (index: number) => void;
  /** The airport at this place made another, from its menu's Change. */
  onReplace: (index: number, ident: string) => void;
}

/** What a runway's fit is worked from (features/procedures/runwayFit): the airplane's
 *  POH figures and its takeoff and landing weights (useLoad). */
export interface FitInputs {
  aircraft: AircraftProfile;
  takeoffLb: number | null;
  landingLb: number | null;
}

/** Where the procedures sheet is open: a field's kind of procedure, and
 *  one to open the page of as the list comes in, asked for by voice
 *  (components/pilotCommand: "the ILS one nine right at Milwaukee") -- the
 *  approach as the FAA's names start ("ILS", "RNAV (GPS)") and its
 *  runway ("19R"), or any runway's. */
export type ProceduresAt = { ident: string; kind: Kind; pick?: { approach: string; runway: string | null } | null } | null;

/** The runways picked at the route's fields, for landing and for leaving. */
interface RunwayPicks {
  /** The runway end picked for each field's pattern. */
  picked: Map<string, string>;
  /** The pilot's pick, the map brought to its pattern; with `go` false,
   *  a runway that follows from another pick, the map left on that one. */
  onPick: (ident: string, end: string | null, go?: boolean) => void;
  /** The runway into the wind picked for the pilot as the route comes in:
   *  into the address with no move of the map, which stays on the route. */
  onPreselect: (ident: string, end: string) => void;
  /** The runway each stop is left from, which may not be the one landed
   *  on ("KMSN:36", the `takeoff` address), and its pick. */
  takeoffs: Map<string, string>;
  onTakeoff: (ident: string, end: string | null) => void;
  /** A stop's runway to leave from picked for the pilot into the wind. */
  onPreselectTakeoff: (ident: string, end: string) => void;
  /** The runways picked into the wind and not since by the pilot
   *  ("land:KABQ", "takeoff:KEVU"): each follows the wind as it changes. */
  autoPicked: ReadonlySet<string>;
  /** The airplane's figures and weights its runways' fit is worked from;
   *  none, no fit marked. */
  fit: FitInputs | null;
}

/** The instrument procedures picked, their sheet and their charts. */
interface ProcedurePicks {
  /** The instrument procedures picked (lib/procedures). */
  procedures: PickedProcedure[];
  /** Those drawn, by field and kind, as the route's box names them, an
   *  approach's with the runway it lands on (approachRunway). */
  inRoute: {
    ident: string;
    kind: Kind;
    id: string;
    runway: string | null;
    name?: string;
    label: string;
    /** The transition picked, none from vectors (RouteProcedure). */
    transition?: string | null;
    fixes?: BranchFix[];
    direct?: string | null;
    /** Loaded, not flown; activated, its missed approach unsuspended; its
     *  missed approach's fixes and the MAP it is suspended at (RouteProcedure). */
    loaded?: boolean;
    missed?: boolean;
    missedFixes?: BranchFix[];
    suspendAt?: string | null;
  }[];
  /** All of them as they are to be, and the one just picked, for the map
   *  to go to. */
  onProcedures: (next: PickedProcedure[], picked: PickedProcedure | null) => void;
  /** The procedure on its page, not yet added, for the map to draw and go
   *  to; null as the page is left. */
  onPreview: (procedure: PickedProcedure | null) => void;
  /** An approach activated or loaded again, its missed approach
   *  unsuspended or suspended (useProcedurePicks' setApproach). */
  onApproach: (ident: string, id: string, change: { loaded?: boolean; missed?: boolean }) => void;
  /** The sheet's kind and field, null while it is put away. */
  at: ProceduresAt;
  onAt: (at: ProceduresAt) => void;
  /** The pilot's own altitudes to cross the procedures' fixes at, by fix. */
  crossings: Record<string, number>;
  /** A fix of a procedure picked, tapped on its branch: its card (FixCard). */
  onFix: (field: string, kind: Kind, fix: string) => void;
  /** The destination's approach charts, in its card. */
  onCharts: () => void;
  chartsDisabled: boolean;
}

/** What a point's menu does with it: its time, altitude, Direct to, card,
 *  removal and a fix off it. */
interface PointActions {
  /** The departure's time picked on its step (DepartPicker). */
  onDepart: (iso: string) => void;
  /** The altitude at a point of the route, as the route box's menu offers
   *  it (PlanWorkspace's altitudeAt), and the pilot's own set there or
   *  (null) given back to the plan. */
  pointAltitude: (ident: string, waypoint: boolean, visit?: number) => PointAltitude;
  onPointAltitude: (ident: string, feet: number | null) => void;
  /** The point flown direct to (the address's `direct`), and Direct to
   *  one, or (null) the route flown as it was. */
  directTo?: string | null;
  onDirectTo: (ident: string | null) => void;
  /** A point's card (an airport's, a waypoint's), from its menu. */
  onInfo: (ident: string) => void;
  /** A stop taken out of the route, from its menu: the visit at `at`
   *  among the route's points, not every visit of it. */
  onRemove: (ident: string, at?: number) => void;
  /** The pilot's own point off one of the route's, flown over after it
   *  (FixFromDialog): "VPBNG/090/30". */
  onCreateFix: (after: string, ident: string) => void;
}

/** What is planned at the stops and fixes: time on the ground, holds and fuel. */
interface StopPlans {
  /** Minutes on the ground at each stop, by ident (the address's
   *  `ground`), and the pick of one, from the time it leaves: a stop not
   *  named, the planner's turnaround (groundMinAt). */
  ground?: Record<string, number>;
  onGround: (ident: string, minutes: number) => void;
  /** The pilot's holds (features/plan/routeHolds), each its own row after its point, and
   *  one set, changed or (null) taken off (HoldSheet). */
  holds: Hold[];
  onHoldSet: (fix: string, hold: Hold | null) => void;
  /** A hold asked for at a point just put in the route ("VPBNG/095/14.2@"
   *  and when, AirspaceCard's Hold here): its sheet opened once the plan
   *  has the leg to the point, for the course flown to it. */
  askHold?: string | null;
  /** The tanks, for the fuel in them at each point: their usable fuel, the
   *  start, taxi and takeoff allowance, each flight's own reserve, in
   *  order, and under IFR the fuel on to the alternate (the totals' fuel
   *  check); none known, no fuel shown. */
  fuel?: { usableGal: number; taxiGal: number; reservesGal: (number | null)[]; alternateGal?: number | null } | null;
  /** The pilot's own fuel leaving a field, gallons by its ident (the
   *  address's `tanks`); the gauges read only (the owner, 2026-11-25:
   *  "Tapping fuel tanks should not do anything"). */
  tanks?: Record<string, number>;
}

/** What FPL's route list (ProceduresRoute) is given: the route's data, and
 *  what can be done to it in groups, each made once (useRouteListProps) and
 *  read flat by the list's view model (useProceduresRoute). */
export interface ProceduresRouteProps {
  airports: ProcedureAirport[];
  /** The route's rows as the nav log has them (navLogRows), for its
   *  fields' times and the points between them; empty until the course
   *  is in, the fields then listed alone. */
  rows: NavLogRow[];
  /** The departure time picked, ISO; empty for now. */
  depart: string;
  /** An airport's weather colour, as its chip on the map. */
  weather: (ident: string) => string | undefined;
  /** The route's points as the address has them, the departure first:
   *  a row not among them -- a fix along an airway typed as V100 -- has no
   *  Direct to, Remove or Create a fix, which work on the typed points
   *  (the audit's finding: they did nothing there, or the wrong thing). */
  routePoints: string[];
  /** As many stops as the planner takes (MAX_STOPS): no Create a fix. */
  stopsFull?: boolean;
  runways: RunwayPicks;
  procedurePicks: ProcedurePicks;
  pointActions: PointActions;
  stopPlans: StopPlans;
  /** The route line under the departure (RouteLine): the planner's ways as
   *  chips, the one picked, and the way to pick one; none, no line. */
  routeLine?: RouteLineChoices | null;
  /** The route changed on the timeline itself (RouteListEdit): each typed
   *  point's grip, Change and Add a Stop After in its menu, and Add a Stop
   *  at its end. None, the route as it is read (in flight, a dry run). */
  edit?: RouteListEdit;
}
