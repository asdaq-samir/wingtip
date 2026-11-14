import type { Detour, FuelStopSuggestion } from "../../../../lib/api/types";
import type { AirspaceClass } from "../../../../lib/preferences";
import type { TypedProcedure } from "../../../../lib/procedures";
import type { PointAltitude } from "../PointAltitudeDialog";
import type { RouteProcedure } from "./RouteChips";
import type { RouteParts } from "./routeEdit";

/** What the route's box is given (RouteBox): the route, what is said
 *  about its points, and what its changes go to. */
export interface RouteBoxProps extends RouteParts {
  /** Which points are waypoints, flown through: in the sectional's magenta. */
  waypoints: Set<string>;
  /** An airport's airspace class, as the course came with it. */
  airspaceOf: (ident: string) => AirspaceClass | undefined;
  /** An airport's METAR colour, for the pills coloured by the weather. */
  metarColourOf: (ident: string) => string | undefined;
  /** The altitude at a point, which its menu offers to change: a
   *  waypoint's cruise there, an airport's pattern. */
  altitudeAt: (ident: string, waypoint: boolean) => PointAltitude;
  /** A point's own altitude set, or (null) given back to the plan. */
  onAltitudeChange: (ident: string, feet: number | null) => void;
  onChange: (route: RouteParts) => void;
  /** SIDs and STARs typed among the points ("BAEE1", lib/procedures'
   *  TYPED_PROCEDURE), taken out of them, for the route's procedures to
   *  pick, with the route they were typed into. */
  onTypedProcedures?: (typed: TypedProcedure[], route: { dep: string; dest: string }) => void;
  /** A stop asked for from elsewhere -- a problem's Add a stop or Fly
   *  via: the box takes the typing where it goes in, with `via` offered. */
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
  /** Fly via's waypoints round the Class B, best first. */
  via?: Detour[];
  /** The procedures picked, after their fields' pills, and the way to the
   *  route's Procedures from one. */
  procedures?: RouteProcedure[];
  onProcedures?: (procedure: RouteProcedure) => void;
  /** An airport's pill tapped: its card (PlaceCard), at the pilot's ask,
   *  the airport changed from the pill's menu instead. A waypoint's tap
   *  is still its search: it has no card. */
  onOpenAirport?: (ident: string) => void;
  /** The point flown direct to, and Direct to one or (null) the route as
   *  it was (PlanWorkspace's directToPoint): the pill's menu's, as FPL's. */
  directTo?: string | null;
  onDirectTo?: (ident: string | null) => void;
  /** The fuel stops the planner suggests for a flight too long for its
   *  tanks (the totals' fuel_stops), dashed after the flight's departure
   *  until added; a tap adds them, as FPL's Add fuel stop does. */
  fuelStops?: FuelStopSuggestion[];
  onKeepFuelStops?: (after: string, idents: string[]) => void;
  /** A suggested fuel stop taken out of the box, the pilot not wanting it
   *  (its menu's Remove); the route's menu or FPL's Routes put it back. */
  onHideFuelStop?: (ident: string) => void;
  /** Where a stop asked for (`adding`) is typed in, before the point at
   *  this place: FPL's list's Add a Stop and Add a Stop After, where the
   *  list changes the route (lib/preferences RouteEdit). None, before the
   *  destination, or where Fly via goes round the Class B. */
  addAt?: number | null;
  /** The box folded again, at its Done, where a whole route's box is
   *  folded away (RouteEdit's "folded"): opened from its line, the box
   *  takes the typing at once. */
  onDone?: () => void;
  /** A point the planner does not know (usePlan's `unknownPlace`): its
   *  pill in red, a tap on it the search to change it, and a line under
   *  the box saying so with Remove -- where it happened, not the map's
   *  problem line (CLAUDE.md, the FPL audit's A2). Its ident null where
   *  the planner's answer named none. */
  unknownPoint?: { ident: string | null } | null;
}
