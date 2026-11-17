import type { AircraftProfile, Detour } from "../../lib/api/types";
import type { BranchFix, PickedProcedure } from "../../lib/procedures";
import type { Hold, NavLogRow, ProcedureAirport, ProcedureKind } from "../plan";
import type { PointAltitude } from "../route";
import type { RouteLineChoices } from "./RouteLine";

type Kind = ProcedureKind;

/** The route changed in FPL's list rather than its box (lib/preferences
 *  RouteEdit), by the points' places in `routePoints`. */
interface RouteListEdit {
  /** A point dragged by its grip onto another's place. */
  onMove: (from: number, to: number) => void;
  /** The route's box opened to type a stop in at this place. */
  onAddAt: (index: number) => void;
  /** The point at this place made another, from its card's ident. */
  onReplace?: (index: number, ident: string) => void;
  /** A stop being added at this place, an empty card there to type it
   *  in (In the Plan, which has no route box), and what is typed put in;
   *  left empty, given up. */
  newAt?: number | null;
  /** Fly via's ways round the Class B, offered on that card, best first. */
  newVia?: Detour[] | null;
  onInsert?: (index: number, ident: string) => void;
  onCancelNew?: () => void;
  /** Each point a card of its own, easier to see as it is dragged (In the
   *  Plan, the owner's pick of the canvas's option 3 as cards). */
  cards?: boolean;
  /** A point changed, from its menu's Change: the route's box opened. */
  onChange?: () => void;
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

/** What FPL's route list (ProceduresRoute) is given. */
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
  /** The runway end picked for each field's pattern. */
  picked: Map<string, string>;
  onPick: (ident: string, end: string | null) => void;
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
  /** The destination's approach charts, in its card. */
  onCharts: () => void;
  chartsDisabled: boolean;
  /** The instrument procedures picked (lib/procedures). */
  procedures: PickedProcedure[];
  /** Those drawn, by field and kind, as the route's box names them, an
   *  approach's with the runway it lands on (approachRunway). */
  inRoute: { ident: string; kind: Kind; id: string; runway: string | null; label: string; fixes?: BranchFix[]; direct?: string | null }[];
  /** All of them as they are to be, and the one just picked, for the map
   *  to go to. */
  onProcedures: (next: PickedProcedure[], picked: PickedProcedure | null) => void;
  /** The procedure on its page, not yet added, for the map to draw and go
   *  to; null as the page is left. */
  onPreview: (procedure: PickedProcedure | null) => void;
  /** The sheet's kind and field, null while it is put away. */
  at: ProceduresAt;
  onAt: (at: ProceduresAt) => void;
  /** Minutes on the ground at each stop, by ident (the address's
   *  `ground`), and the pick of one, from the time it leaves: a stop not
   *  named, the planner's turnaround (groundMinAt). */
  ground?: Record<string, number>;
  onGround: (ident: string, minutes: number) => void;
  /** The pilot's own altitudes to cross the procedures' fixes at, by fix. */
  crossings: Record<string, number>;
  /** A fix of a procedure picked, tapped on its branch: its card (FixCard). */
  onFix: (field: string, kind: Kind, fix: string) => void;
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
  /** A stop taken out of the route, from its menu. */
  onRemove: (ident: string) => void;
  /** The pilot's own point off one of the route's, flown over after it
   *  (FixFromDialog): "VPBNG/090/30". */
  onCreateFix: (after: string, ident: string) => void;
  /** The pilot's holds (features/plan/routeHolds), each its own row after its point, and
   *  one set, changed or (null) taken off (HoldSheet). */
  holds: Hold[];
  onHoldSet: (fix: string, hold: Hold | null) => void;
  /** A hold asked for at a point just put in the route ("VPBNG/095/14.2@"
   *  and when, AirspaceCard's Hold here): its sheet opened once the plan
   *  has the leg to the point, for the course flown to it. */
  askHold?: string | null;
  /** The route's points as the address has them, the departure first:
   *  a row not among them -- a fix along an airway typed as V100 -- has no
   *  Direct to, Remove or Create a fix, which work on the typed points
   *  (the audit's finding: they did nothing there, or the wrong thing). */
  routePoints: string[];
  /** As many stops as the planner takes (MAX_STOPS): no Create a fix. */
  stopsFull?: boolean;
  /** The tanks, for the fuel in them at each point: their usable fuel, the
   *  start, taxi and takeoff allowance and the reserve the flight is held
   *  to (the totals' fuel check); none known, no fuel shown. */
  fuel?: { usableGal: number; taxiGal: number; reserveGal: number } | null;
  /** The route line under the departure (RouteLine): the planner's ways as
   *  chips, the one picked, and the way to pick one; none, no line. */
  routeLine?: RouteLineChoices | null;
  /** The route changed in the list itself (RouteListEdit): each typed
   *  point's grip, Add a Stop After in its menu, and Add a Stop at the
   *  list's end. None, the list as before. */
  edit?: RouteListEdit;
}
