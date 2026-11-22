import { create } from "zustand";
import { persist } from "zustand/middleware";
import { NO_MINIMUMS } from "./minimums";
import { AIRPLANE_KEPT, airplaneChosen, airplaneSlice, NO_AIRPLANE } from "./prefs/airplaneSlice";
import { ALERTS_KEPT, alertsSlice } from "./prefs/alertsSlice";
import { KEPT_KEPT, keptSlice } from "./prefs/keptSlice";
import type { RecentAirport } from "./prefs/keptTypes";
import { LOOK_KEPT, lookSlice } from "./prefs/lookSlice";
import { MAP_KEPT, mapSlice } from "./prefs/mapSlice";
import type { Preferences } from "./prefs/state";
import { keptTheme, migratePreferences } from "./prefs/migrate";

export { BASE_CHARTS, HEIGHT_STRETCHES } from "./prefs/mapSlice";
export type { BaseChart, HazardSetting, HeightStretch, ChartLight, MapOverlay, OverlayStrength } from "./prefs/mapTypes";
export type { Brand, FlightRules, NavEdge, OwnShipLook } from "./prefs/lookTypes";
export { airplaneChosen, NO_AIRPLANE, STOCK_C172 } from "./prefs/airplaneSlice";
export type { RouteWeather } from "./prefs/airplaneTypes";
export { recentRouteKey } from "./prefs/keptSlice";
export type { AirspaceClass, KeptAircraft, RecentAirport, RecentRoute } from "./prefs/keptTypes";
export type { Preferences } from "./prefs/state";

/** What is written to storage: the values, not the functions. */
const KEPT = [...MAP_KEPT, ...LOOK_KEPT, ...AIRPLANE_KEPT, ...KEPT_KEPT, ...ALERTS_KEPT] as const;
type Kept = Pick<Preferences, (typeof KEPT)[number]>;

/** What of the preferences is written: every value, the map's overlay
 *  and its strength among them (lost on a reload before, WEB-15), no
 *  function. */
export function keptPreferences(s: Preferences): Kept {
  return Object.fromEntries(KEPT.map((k) => [k, s[k]])) as Kept;
}

export const usePreferences = create<Preferences>()(
  persist((...a) => ({ ...mapSlice(...a), ...lookSlice(...a), ...airplaneSlice(...a), ...keptSlice(...a), ...alertsSlice(...a) }), {
    name: "wingtip.preferences",
    // Nothing is launched yet, so a browser's preferences from an older
    // version are read as they are (the owner: break freely until launch;
    // see keptAsIs), but for Appearance's Dark + Bright, which became the
    // Dimmer's dark value of 0 in version 12 (prefs/migrate).
    version: 12,
    migrate: (kept, version) => migratePreferences(kept, version, keptTheme()),
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
