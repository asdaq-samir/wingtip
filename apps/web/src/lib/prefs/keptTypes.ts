import type { AircraftKind } from "../aircraftKind";

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

/** What is the pilot's own of places and airplanes: Maps' Home, Favorites
 *  and Recents, and the routes planned last. */
export interface KeptSlice {
  /** The airports last picked from the search bar, newest first: what
   *  it offers before anything is typed, as Maps' Recents. */
  recentAirports: RecentAirport[];
  /** Maps' Favorites: the pilot's home field and the others they star,
   *  first under the search bar. */
  homeAirport: RecentAirport | null;
  favoriteAirports: RecentAirport[];
  /** The airplanes whose cards were opened last, newest first, and the
   *  ones the pilot starred, as the airports' are (features/plan AircraftTiles). */
  recentAircraft: KeptAircraft[];
  favoriteAircraft: KeptAircraft[];
  /** The pilot's own airplane, first among the airplanes' Favorites as
   *  Home is among the airports', at the owner's ask: "My Plane". */
  myAircraft: KeptAircraft | null;
  /** The routes planned last, newest first, kept on this device: FPL's
   *  Recents under its Saved, a tap planning one again. */
  recentRoutes: RecentRoute[];
  addRecentRoute: (route: RecentRoute) => void;
  removeRecentRoute: (key: string) => void;
  clearRecentRoutes: () => void;
  setMyAircraft: (aircraft: KeptAircraft | null) => void;
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
