import {
  createLoader,
  createParser,
  createSerializer,
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
  type Nullable,
  type SetValues,
  type Values,
} from "nuqs";
import type { AltitudeChoice } from "./api/types";
import { pointOf } from "./airspace";
import { SCREEN_LINK } from "./navigation/generated/screens";
import type { LatLon } from "./geo";

/**
 * The planner's address, key by key, read and written through nuqs (the
 * owner's pick, 2026-11-12, in place of two hooks of our own): the plan is
 * kept in the address so a link, Back or a reload lands on it, and each
 * key has one typed parser here, which every hook that reads the key uses
 * -- nuqs hands a change of a key to every hook reading it as the value
 * the writer's parser made, so two parsers for one key would disagree.
 *
 * A component reading one key (useAddressKey) draws again only when that
 * key changes; the workspace reads them all (useAddress). A change written
 * as a function is worked out from the address as it is now, the changes
 * not yet in the browser's address included, so two before the next
 * render both land (address.test.ts). A change is the keys it names: a
 * key left out is left as it is, and null takes a key out.
 */

/** A key that is there ("1") or not: a card or a list open, a choice
 *  made. False takes it out of the address. */
const flag = createParser<boolean>({ parse: (v) => (v === "1" ? true : null), serialize: () => "1" }).withDefault(false);

/** A point on Earth, `42.3172,-88.0905`, to four places (11 m). */
const point = createParser<LatLon>({
  parse: pointOf,
  serialize: (p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`,
  eq: (a, b) => a.lat === b.lat && a.lon === b.lon,
});

/** A point as the address keeps it, to four places: written so, the page
 *  reads the same point a link or a reload would. */
export const addressPoint = (p: LatLon): LatLon => pointOf(point.serialize(p))!;

/** A local flight's times aloft to choose from, in minutes (`local_min`):
 *  a menu, not a slider. An hour is not written. */
export const LOCAL_MINUTES = [30, 45, 60, 90, 120, 150, 180, 240];

/** A list in full, from its section's title (`?list=favorites`): the
 *  airports' Favorites and Recents, the routes planned, the airplanes'
 *  Favorites and Recents. Saved and Nearest have keys of their own. */
export const PANEL_LISTS = ["favorites", "recents", "routes", "aircraft-favorites", "aircraft-recents"] as const;

const ALTITUDE_CHOICES = ["fastest", "lowest", "highest", "economical"] as const satisfies readonly AltitudeChoice[];

export const addressParsers = {
  // The route: its ends and its stops as typed (lib/identSchema reads them).
  dep: parseAsString,
  dest: parseAsString,
  stops: parseAsString,
  // A Direct to's point, and the route as it was before it ("dep|stops|dest").
  direct: parseAsString,
  was: parseAsString,
  // The fuel stops among the stops, and the IFR alternate filed.
  fuel: parseAsString,
  alternate: parseAsString,
  // The altitude: the pilot's own in feet, picked on the wheel (each leg
  // at its nearest legal one), or a plan, the fastest not written.
  altitude_ft: parseAsInteger,
  altitude_nearest: flag,
  altitude_choice: parseAsStringLiteral(ALTITUDE_CHOICES).withDefault("fastest"),
  // Points whose own altitude begins there rather than is reached by them.
  altitude_starts: parseAsString,
  // Class B planned through with its clearance (14 CFR 91.131) unless the
  // pilot avoids it ("0"), and the waypoint round it then.
  class_b: createParser({ parse: (v) => v !== "0", serialize: (through: boolean) => (through ? "1" : "0") }).withDefault(true),
  class_b_via: parseAsString,
  // The picks at the route's fields, each in the text its reader parses
  // (features/plan/lib/fieldLists): runways landed on and left from, the
  // runways picked into the wind, procedures, points' altitudes, crossing
  // altitudes, times on the ground and holds.
  pattern: parseAsString,
  takeoff: parseAsString,
  auto: parseAsString,
  procs: parseAsString,
  altitudes: parseAsString,
  cross: parseAsString,
  ground: parseAsString,
  holds: parseAsString,
  // The departure time (an ISO instant; none is about now), and a local
  // flight's time aloft.
  depart: parseAsString,
  local_min: parseAsNumberLiteral(LOCAL_MINUTES).withDefault(60),
  // The sheet all the way up, where the pilot left it.
  view: parseAsStringLiteral(["briefing"] as const),
  // What is open over the sheet: an airport's card, the airspace over a
  // point held, an airplane tracked by its ICAO address and one of its past
  // flights by its takeoff's time, the traffic, Nearest and the place it
  // is from, Saved, a list in full, the Brief, a lesson, an airplane's
  // profile by its N-number.
  place: parseAsString,
  at: point,
  flight: createParser({ parse: (v) => (/^~?[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null), serialize: (v: string) => v }),
  past: createParser({ parse: (v) => (/^\d{9,11}$/.test(v) ? Number(v) : null), serialize: (v: number) => String(v) }),
  aircraft: flag,
  near: flag,
  nearAt: point,
  nearName: parseAsString,
  saved: flag,
  list: parseAsStringLiteral(PANEL_LISTS),
  brief: flag,
  lesson: parseAsString,
  airplane: parseAsString,
  // Read once and taken off: a screen a link opens (`open`,
  // lib/navigation's SCREEN_LINK), favorites a link brings, a sign-in the
  // gateway refused.
  [SCREEN_LINK.key]: parseAsString,
  favorites: parseAsString,
  home: parseAsString,
  signin: parseAsString,
};

export type AddressParsers = typeof addressParsers;
export type Address = Values<AddressParsers>;
export type SetAddress = SetValues<AddressParsers>;
/** Some of the address's keys, as a change writes them: null takes one out. */
export type AddressChange = Partial<Nullable<Address>>;

/** The whole address and its setter: what the planner's workspace reads. */
export const useAddress = () => useQueryStates(addressParsers);

/** One key of the address, drawn again only when it changes. */
export const useAddressKey = <K extends keyof AddressParsers>(key: K) => useQueryState(key, addressParsers[key]);

/** Every key of the address taken out: with a change spread over it, an
 *  address that is that change alone (a route cleared, Fly Here's). */
export const ADDRESS_CLEARED = Object.fromEntries(Object.keys(addressParsers).map((key) => [key, null])) as { [K in keyof Address]: null };

/** An address read from a link's text or its params (a recent route, a
 *  saved flight), each key by its parser as the page reads it. */
export const loadAddress = createLoader(addressParsers);

/** The address's text for these keys ("?dep=C81&dest=KDLH"), as nuqs
 *  writes it: a key at its default or null is left out. */
const serializeAddress = createSerializer(addressParsers);

/** The keys of the address set, as text, for what keeps them as text (the
 *  route's history, a saved flight's picks). */
export const addressParams = (address: Partial<Address>) => new URLSearchParams(serializeAddress(address));

/** The route's two ends, and with the stops its whole route. */
export const ENDS_KEYS = ["dep", "dest"] as const satisfies readonly (keyof AddressParsers)[];
const ROUTE_KEYS = [...ENDS_KEYS, "stops"] as const satisfies readonly (keyof AddressParsers)[];

/** What the pilot picked for a flight beyond its route: the altitude flown
 *  (a pilot's own, the wheel's, or a plan), the runways (and which were
 *  picked into the wind, `auto`), procedures and crossing altitudes, the
 *  times on the ground, the holds, the Class B avoided and its detour and
 *  the IFR alternate. A saved flight (the gateway's SaveFlightRequest.PICK,
 *  the same keys) and a recent route keep them (lib/flightLink). */
export const PICK_KEYS = [
  "altitude_ft",
  "altitude_nearest",
  "altitude_choice",
  "pattern",
  "takeoff",
  "auto",
  "procs",
  "cross",
  "ground",
  "holds",
  "class_b",
  "class_b_via",
  "alternate",
] as const satisfies readonly (keyof AddressParsers)[];

/** The keys that are the plan, for undo and redo (hooks/planHistory): the
 *  route, a Direct to and the route before it, the fuel stops, the picks
 *  and the points' own altitudes. Not the page's own (the card open, the
 *  panel, the departure time). */
export const PLAN_KEYS = [...ROUTE_KEYS, "direct", "was", "fuel", ...PICK_KEYS, "altitudes"] as const satisfies readonly (keyof AddressParsers)[];
