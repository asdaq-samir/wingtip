import type { AircraftKind } from "../aircraftKind";
import { NO_FILTER, type AircraftFilter } from "../fbo";
import { sameField } from "../procedures";
import type { Slice } from "./slice";

/** The airspace at an airport's surface, as the sectional draws it. */
export type AirspaceClass = "B" | "C" | "D" | "E" | "G";

/** An airport as the search bar and Favorites remember it: where it is too
 *  once it is known, for how far it is from own ship, and its airspace,
 *  for its tile to be drawn right before the planner answers. */
export interface RecentAirport {
  ident: string;
  name: string;
  municipality?: string | null;
  lat?: number;
  lon?: number;
  airspace?: AirspaceClass;
}

/** What this browser keeps of an airplane picked or starred: its ICAO
 *  address, what it is called (its registration, else its callsign) and
 *  its type, for its tile and row before anything is asked; and the shape
 *  it is drawn as (lib/aircraftKind), worked out from all that was known
 *  when it was kept. */
export interface KeptAircraft {
  hex: string;
  name: string;
  type: string | null;
  kind?: AircraftKind;
}

/** A route planned, as FPL's Recents keep it: its ends, its stops in
 *  order, and when it was planned. */
export interface RecentRoute {
  dep: string;
  dest: string;
  stops: string[];
  at: number;
  /** What was picked for it besides, as the address writes it (lib/
   *  flightLink picksOf): planned again as it was. None before 20 Oct. */
  picks?: string;
}

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

/** What is the pilot's own of places and airplanes: Maps' Home, Favorites
 *  and Recents, the routes planned last and the Aircraft tab's filters. */
export interface KeptSlice {
  /** The airports last picked from the search bar, newest first: what
   *  it offers before anything is typed, as Maps' Recents. */
  recentAirports: RecentAirport[];
  /** Maps' Favorites: the pilot's home field and the others they star,
   *  first under the search bar. */
  homeAirport: RecentAirport | null;
  favoriteAirports: RecentAirport[];
  /** The airplanes whose cards were opened last, newest first, and the
   *  ones the pilot starred, as the airports' are (AircraftCard). */
  recentAircraft: KeptAircraft[];
  favoriteAircraft: KeptAircraft[];
  /** The pilot's own airplane, first among the Aircraft card's Favorites
   *  as Home is among the airports', at the owner's ask: "My Plane". */
  myAircraft: KeptAircraft | null;
  /** The routes planned last, newest first, kept on this device: FPL's
   *  Recents under its Saved, a tap planning one again. */
  recentRoutes: RecentRoute[];
  /** The Aircraft tab's filters (lib/fbo), kept: an FBO's desk keeps its
   *  airport from one day to the next. */
  aircraftFilter: AircraftFilter;
  addRecentRoute: (route: RecentRoute) => void;
  removeRecentRoute: (key: string) => void;
  clearRecentRoutes: () => void;
  setMyAircraft: (aircraft: KeptAircraft | null) => void;
  setAircraftFilter: (change: Partial<AircraftFilter>) => void;
  addRecentAircraft: (aircraft: KeptAircraft) => void;
  /** One airplane taken off the Recents (a swipe), or all of them (Clear). */
  removeRecentAircraft: (hex: string) => void;
  clearRecentAircraft: () => void;
  toggleFavoriteAircraft: (aircraft: KeptAircraft) => void;
  /** A Favorite airplane moved up or down the list, as the airports' are. */
  moveFavoriteAircraft: (from: number, to: number) => void;
  addRecentAirport: (airport: RecentAirport) => void;
  /** One airport taken off the Recents (a swipe), or all of them (Clear). */
  removeRecentAirport: (ident: string) => void;
  clearRecentAirports: () => void;
  setHomeAirport: (airport: RecentAirport | null) => void;
  /** Kept if it was not, let go if it was. */
  toggleFavoriteAirport: (airport: RecentAirport) => void;
  /** A kept one moved from one place in the list to another. */
  moveFavoriteAirport: (from: number, to: number) => void;
  /** An airport's airspace, as the planner answered it, kept with Home
   *  and the favorites that are that airport. */
  rememberAirspace: (ident: string, airspace: AirspaceClass) => void;
}

export const KEPT_KEPT = [
  "recentAirports",
  "homeAirport",
  "favoriteAirports",
  "recentAircraft",
  "favoriteAircraft",
  "myAircraft",
  "recentRoutes",
  "aircraftFilter",
] as const;

export const keptSlice: Slice<KeptSlice> = (set) => ({
  recentAirports: [],
  homeAirport: null,
  favoriteAirports: [],
  recentAircraft: [],
  favoriteAircraft: [],
  myAircraft: null,
  recentRoutes: [],
  aircraftFilter: NO_FILTER,
  addRecentRoute: (route) =>
    set((s) => ({ recentRoutes: [route, ...s.recentRoutes.filter((r) => recentRouteKey(r) !== recentRouteKey(route))].slice(0, RECENTS) })),
  removeRecentRoute: (key) => set((s) => ({ recentRoutes: s.recentRoutes.filter((r) => recentRouteKey(r) !== key) })),
  clearRecentRoutes: () => set({ recentRoutes: [] }),
  setMyAircraft: (myAircraft) => set({ myAircraft }),
  setAircraftFilter: (change) => set((s) => ({ aircraftFilter: { ...s.aircraftFilter, ...change } })),
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
