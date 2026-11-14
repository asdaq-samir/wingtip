import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AircraftChoice } from "./api/types";
import { NO_MINIMUMS } from "./minimums";
import { AIRPLANE_KEPT, airplaneChosen, airplaneSlice, isStockDefault, NO_AIRPLANE, type AirplaneSlice } from "./prefs/airplaneSlice";
import { ALERTS_KEPT, alertsSlice, type AlertsSlice } from "./prefs/alertsSlice";
import { KEPT_KEPT, keptSlice, type KeptSlice, type RecentAirport } from "./prefs/keptSlice";
import { LOOK_KEPT, lookSlice, type LookSlice } from "./prefs/lookSlice";
import { MAP_KEPT, mapSlice, type MapSlice } from "./prefs/mapSlice";

export { BASE_CHARTS, type BaseChart, type ChartLight, type ChartNight, type MapOverlay, type OverlayStrength } from "./prefs/mapSlice";
export type { Brand, FlightRules, NavEdge, RouteEdit } from "./prefs/lookSlice";
export { airplaneChosen, NO_AIRPLANE, STOCK_C172, type RouteWeather } from "./prefs/airplaneSlice";
export { recentRouteKey, type AirspaceClass, type KeptAircraft, type RecentAirport, type RecentRoute } from "./prefs/keptSlice";

/**
 * Everything remembered per browser, in one zustand store persisted to
 * localStorage by its own middleware under one key, made of zustand's stock
 * slices, one file each (lib/prefs): what the map draws (mapSlice), the
 * app's look (lookSlice), the airplane and the pilot's limits
 * (airplaneSlice), the places and airplanes kept (keptSlice) and what is
 * said in the air (alertsSlice). It was one 614-line store changed by
 * every feature (the code audit's CODE-22). Components read a part with
 * the hook (`usePreferences(s => s.base)`); code outside React -- the
 * map's chart layers -- reads `getState()` and `subscribe()`.
 *
 * localStorage is a convenience only: unavailable (a private window,
 * blocked site data) the store simply starts from its defaults each
 * visit, which the middleware handles on its own.
 */
export interface Preferences extends MapSlice, LookSlice, AirplaneSlice, KeptSlice, AlertsSlice {}

/** What is written to storage: the values, not the functions. */
const KEPT = [...MAP_KEPT, ...LOOK_KEPT, ...AIRPLANE_KEPT, ...KEPT_KEPT, ...ALERTS_KEPT] as const;
type Kept = Pick<Preferences, (typeof KEPT)[number]>;

/** What a browser kept under an older version, brought up to this one
 *  (the versions are listed where usePreferences is made). */
export function migratePreferences(kept: unknown, from: number): Preferences {
  // 9: the sheet's edge, the flat ground and own ship's look let go, none a
  // setting now (2026-11-13): a browser's kept top, flat or arrow falls
  // back to the bottom, the shaded ground and the airplane, unsaid.
  const {
    navBar: _navBar,
    terrain,
    ownShipLook: _ownShipLook,
    ...rest
  } = kept as { navBar?: unknown; terrain?: string; ownShipLook?: unknown };
  return {
    ...rest,
    ...(from < 6 && isStockDefault((kept as { aircraft?: AircraftChoice }).aircraft) ? { aircraft: NO_AIRPLANE } : {}),
    ...(from < 1 ? { waypoints: false } : {}),
    ...(from < 2 ? { airspace: true, navaids: true } : {}),
    ...(from < 3 ? { chartLight: "auto" } : {}),
    ...(from < 7 && (kept as { brand?: string }).brand !== "ink" ? { brand: "wingtip" } : {}),
    ...(from < 8 && terrain === "3d" ? { threeD: true } : {}),
  } as Preferences;
}

/** What of the preferences is written: every value, the map's overlay
 *  and its strength among them (lost on a reload before, WEB-15), no
 *  function. */
export function keptPreferences(s: Preferences): Kept {
  return Object.fromEntries(KEPT.map((k) => [k, s[k]])) as Kept;
}

export const usePreferences = create<Preferences>()(
  persist((...a) => ({ ...mapSlice(...a), ...lookSlice(...a), ...airplaneSlice(...a), ...keptSlice(...a), ...alertsSlice(...a) }), {
    name: "wingtip.preferences",
    // 1: the VFR checkpoints off unless turned on (the owner's ask). 2:
    // the airspace and the VORs on for every browser (the map's looks).
    // 3: the sunlit chart from the light sensor (Auto). 4: a look no
    // longer offered is the Glass Cockpit. 5: the tabs for everyone, the
    // strip and the field taken out of Setup (the owner, 2026-11-04). 6:
    // no airplane until one is picked; the stock C172 let go (2026-11-08).
    // 7: the Wingtip look, the default, for a browser on the old default
    // (Glass Cockpit, never picked; 2026-11-09). 8: 3D a switch of its
    // own, the map's button (2026-11-13); a kept "3d" is shaded in it.
    // 9: Position, Terrain and You on the Map taken out (2026-11-13):
    // what was kept of them let go (migratePreferences). The overlay and
    // its strength kept from 2026-11-14 need no step: a browser without
    // them starts from None at half, as before.
    version: 9,
    migrate: migratePreferences,
    partialize: keptPreferences,
  }),
);

/** airplaneChosen, for a screen: whether to show what needs an airplane. */
export const useAirplaneChosen = (): boolean => usePreferences((s) => airplaneChosen(s.aircraft));

/** What was the pilot's own taken out of this device's preferences as
 *  they sign out (useLogout): their Home, Favorites and recents, their
 *  personal minimums and loads, the airplanes they follow and their
 *  alerts, and the airplane they fly. The next person on the device had
 *  them all, the tail number and its figures too (the audit's finding).
 *  How the map is drawn stays, the device's. */
export function forgetPilot() {
  usePreferences.setState({
    minimums: NO_MINIMUMS,
    routeWeather: "personal",
    loads: {},
    aircraft: NO_AIRPLANE,
    tailFigures: {},
    recentAirports: [],
    homeAirport: null,
    favoriteAirports: [],
    recentAircraft: [],
    favoriteAircraft: [],
    myAircraft: null,
    aircraftAlerts: [],
    recentRoutes: [],
  });
}

/** What this browser keeps of a field -- Home, a Favorite, one picked
 *  lately -- its name and, once it was looked up, where it is: what its
 *  card and the map show at once, before the planner answers. */
export function useKeptAirport(ident: string | null): RecentAirport | null {
  return usePreferences((p) =>
    ident ? ([p.homeAirport, ...p.favoriteAirports, ...p.recentAirports].find((a) => a?.ident === ident) ?? null) : null,
  );
}
