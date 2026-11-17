import { sameField } from "../procedures";
import type { Slice } from "./slice";
import type { RecentRoute, KeptSlice } from "./keptTypes";

/** One key a route, for its place in the Recents: the same ends and stops
 *  are the same route, planned again. */
export function recentRouteKey(route: Pick<RecentRoute, "dep" | "dest" | "stops">): string {
  return `${route.dep}|${route.stops.join(",")}|${route.dest}`;
}

/** How many the search bar remembers. */
const RECENTS = 8;

/** A kept list's one moved from one place to another. */
function moved<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [one] = next.splice(from, 1);
  if (one) next.splice(to, 0, one);
  return next;
}

export const KEPT_KEPT = [
  "recentAirports",
  "homeAirport",
  "favoriteAirports",
  "recentAircraft",
  "favoriteAircraft",
  "myAircraft",
  "recentRoutes",
] as const;

export const keptSlice: Slice<KeptSlice> = (set) => ({
  recentAirports: [],
  homeAirport: null,
  favoriteAirports: [],
  recentAircraft: [],
  favoriteAircraft: [],
  myAircraft: null,
  recentRoutes: [],
  addRecentRoute: (route) =>
    set((s) => ({ recentRoutes: [route, ...s.recentRoutes.filter((r) => recentRouteKey(r) !== recentRouteKey(route))].slice(0, RECENTS) })),
  removeRecentRoute: (key) => set((s) => ({ recentRoutes: s.recentRoutes.filter((r) => recentRouteKey(r) !== key) })),
  setMyAircraft: (myAircraft) => set({ myAircraft }),
  addRecentAircraft: (aircraft) =>
    set((s) => ({
      recentAircraft: [aircraft, ...s.recentAircraft.filter((a) => a.hex !== aircraft.hex)].slice(0, RECENTS),
      // A favourite's name and type kept up to date as it is seen again.
      favoriteAircraft: s.favoriteAircraft.map((a) => (a.hex === aircraft.hex ? aircraft : a)),
      myAircraft: s.myAircraft?.hex === aircraft.hex ? aircraft : s.myAircraft,
    })),
  removeRecentAircraft: (hex) => set((s) => ({ recentAircraft: s.recentAircraft.filter((a) => a.hex !== hex) })),
  clearRecentAircraft: () => set({ recentAircraft: [] }),
  toggleFavoriteAircraft: (aircraft) =>
    set((s) => ({
      favoriteAircraft: s.favoriteAircraft.some((a) => a.hex === aircraft.hex)
        ? s.favoriteAircraft.filter((a) => a.hex !== aircraft.hex)
        : [...s.favoriteAircraft, aircraft],
    })),
  moveFavoriteAircraft: (from, to) => set((s) => ({ favoriteAircraft: moved(s.favoriteAircraft, from, to) })),
  addRecentAirport: (airport) =>
    set((s) => ({ recentAirports: [airport, ...s.recentAirports.filter((a) => a.ident !== airport.ident)].slice(0, RECENTS) })),
  removeRecentAirport: (ident) => set((s) => ({ recentAirports: s.recentAirports.filter((a) => a.ident !== ident) })),
  clearRecentAirports: () => set({ recentAirports: [] }),
  setHomeAirport: (homeAirport) => set({ homeAirport }),
  toggleFavoriteAirport: (airport) =>
    set((s) => ({
      // One field by either of its idents (KLWM, LWM), as the card's star
      // reads it (PlaceCard), so a star shown filled is taken off.
      favoriteAirports: s.favoriteAirports.some((a) => sameField(a.ident, airport.ident))
        ? s.favoriteAirports.filter((a) => !sameField(a.ident, airport.ident))
        : [...s.favoriteAirports, airport],
    })),
  moveFavoriteAirport: (from, to) => set((s) => ({ favoriteAirports: moved(s.favoriteAirports, from, to) })),
  rememberAirspace: (ident, airspace) =>
    set((s) => ({
      homeAirport: s.homeAirport?.ident === ident ? { ...s.homeAirport, airspace } : s.homeAirport,
      favoriteAirports: s.favoriteAirports.map((a) => (a.ident === ident ? { ...a, airspace } : a)),
    })),
});
