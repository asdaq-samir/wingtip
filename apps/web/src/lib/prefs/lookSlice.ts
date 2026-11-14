import type { Slice } from "./slice";

/** The screen edge the map panel is on -- and so what the consoles and
 *  panels come in from, and which edge the map's buttons keep clear
 *  of (useNavEdge): the bottom on a phone, always (the owner, 2026-11-13,
 *  Position taken out of the settings), the top from `md` up. */
export type NavEdge = "top" | "bottom";
/** The app's look (lib/brand): Wingtip, the brand's blue and the
 *  default (the owner, 2026-11-09), Glass Cockpit or Chart ink (kept
 *  2026-11-04), or Native, stock out of the box (2026-11-10). */
export type Brand = "wingtip" | "cockpit" | "ink" | "native";
/** The flight rules a route is planned under (the altitude's popover):
 *  VFR, or IFR -- its minimum altitudes, its thousands by direction of
 *  flight and its 45-minute reserve (the planner's wingtip.ifr). */
export type FlightRules = "vfr" | "ifr";
/** How FPL's route is changed once it has a destination, the owner's
 *  two picks of the FPL canvas (2026-11-05) and the box as it was: `box`,
 *  the route's box over the plan; `folded`, the box folded to one line, a
 *  tap opening it again (A); `plan`, no box, the plan's rows dragged and
 *  added to (B). In the route's ••• menu, Show Route As (ShowRouteAs). */
export type RouteEdit = "box" | "folded" | "plan";

/** The app's look and how the pilot works a route: Settings' Look. */
export interface LookSlice {
  /** The app's look: its tint, its typeface and its corners (lib/brand). */
  brand: Brand;
  /** The flight rules every route is planned under, kept: a pilot who
   *  files IFR files it flight after flight. */
  flightRules: FlightRules;
  /** How FPL's route is changed once it has a destination (RouteEdit). */
  routeEdit: RouteEdit;
  setBrand: (brand: Brand) => void;
  setFlightRules: (flightRules: FlightRules) => void;
  setRouteEdit: (routeEdit: RouteEdit) => void;
}

export const LOOK_KEPT = ["brand", "flightRules", "routeEdit"] as const;

export const lookSlice: Slice<LookSlice> = (set) => ({
  brand: "wingtip",
  flightRules: "vfr",
  // The box as it was, till the pilot picks another.
  routeEdit: "box",
  setBrand: (brand) => set({ brand }),
  setFlightRules: (flightRules) => set({ flightRules }),
  setRouteEdit: (routeEdit) => set({ routeEdit }),
});
