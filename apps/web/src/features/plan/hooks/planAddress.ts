import type { Address, AddressChange } from "../../../lib/address";
import type { FuelStopSuggestion } from "../../../lib/api/types";
import { fieldListParams, fieldListsOf, renamedFieldLists } from "../lib/fieldLists";
import { positionIdent, stopsOf } from "../../../lib/identSchema";
import { proceduresOf, proceduresParam, sameField } from "../../../lib/procedures";
import { patternsOf } from "../../../lib/trafficPattern";
import type { SuggestedStop } from "../components/StopServices";

/**
 * The planner's address read and written, with nothing of React in it:
 * the plan is kept in the address (usePlanWorkspace), and these are the
 * pieces of it the workspace's hooks share -- a Direct to's route kept for
 * its Cancel, a field renamed everywhere it is named, the runways picked
 * into the wind -- each a function of the address, tested as one
 * (planAddress.test.ts). Each key's parser is lib/address's; a change
 * returned here is the keys it names, null taking one out.
 */

/** The address's keys that name a route or a pick on it, each read by the
 *  shared engine (lib/identSchema, lib/procedures, lib/routeHolds). */
const ROUTE_KEYS = ["dep", "dest", "stops", "altitudes", "procs", "cross", "ground", "holds"] as const;

/** Whether the address names a route, which only the engine can read: the
 *  workspace waits for it then (usePlanWorkspace), and draws at once with
 *  none -- every fresh open (features/shell/freshLoad) -- the parts that
 *  ask the engine waiting each on its own (lib/engine/engineGate). */
export const namesRoute = (address: Pick<Address, (typeof ROUTE_KEYS)[number]>) => ROUTE_KEYS.some((key) => address[key] !== null);

/** The route as the address has it this render: its ends, and the points
 *  it goes by on the way (usePlanWorkspace's `planned`). */
export interface PlannedRoute {
  dep: string;
  dest: string;
  stops: string[];
}

/** The suggested stop at a field, where it is one of the planner's
 *  (the totals' fuel_stops): the field its flight leaves, and its figures
 *  for the field's card (PlaceCard's `stop`). */
export function suggestedStopAt(ident: string | null, suggestions: FuelStopSuggestion[]): { after: string; stop: SuggestedStop } | null {
  if (!ident) return null;
  for (const f of suggestions) {
    const found = [...f.stops, ...(f.choices ?? [])].find((c) => sameField(c.ident, ident));
    if (found) {
      return {
        after: f.departure,
        stop: {
          reason: f.reason ?? "fuel",
          from: f.departure,
          minutes: found.minutes,
          landsWithGal: found.lands_with_gal,
          addedNm: found.added_nm,
        },
      };
    }
  }
  return null;
}

/** The route as the address has it, "dep|stops|dest", kept as a Direct to
 *  goes in (directToPoint) for its Cancel. */
export const routeWas = (address: Pick<Address, "dep" | "stops" | "dest">) =>
  `${address.dep ?? ""}|${address.stops ?? ""}|${address.dest ?? ""}`;

type DirectAddress = Pick<Address, "dep" | "stops" | "dest" | "direct" | "was" | "procs">;

/** The address's changes that give a Direct to back: the route as it was
 *  before it; none with no Direct to. */
export function routeBeforeDirect(address: DirectAddress): AddressChange {
  const was = address.was;
  if (address.direct === null && !was) return {};
  const [dep = "", stops = "", dest = ""] = (was || routeWas(address)).split("|");
  return { dep: dep || null, stops: stops || null, dest: dest || null, direct: null, was: null };
}

/** The address's changes for a Direct to a point of the route (`ident`),
 *  as ATC sends an airplane: from `fix` where the airplane is, else from
 *  the departure, on from the point as it was planned; the route as it
 *  was kept (`was`) for Cancel, and a procedure's own direct given back
 *  (one at a time). `ident` null is the Cancel; a point not on the route
 *  changes nothing. */
export function directToPatch(prev: DirectAddress, ident: string | null, fix: Parameters<typeof positionIdent>[0] | null): AddressChange {
  if (ident === null) return routeBeforeDirect(prev);
  const was = prev.was || routeWas(prev);
  const [dep = "", stopsWere = "", dest = ""] = was.split("|");
  const stopsThen = stopsOf(stopsWere);
  const at = stopsThen.findIndex((stop) => sameField(stop, ident));
  if (at < 0 && !sameField(dest, ident)) return {};
  const procs = proceduresOf(prev.procs);
  return {
    dep: (fix ? positionIdent(fix) : dep) || null,
    stops: at < 0 ? null : stopsThen.slice(at).join(",") || null,
    dest: dest || null,
    direct: ident || null,
    was,
    procs: procs.some((p) => p.direct) ? proceduresParam(procs.map((p) => ({ ...p, direct: null }))) || null : undefined,
  };
}

/** The address's changes for a field's ident changed everywhere it is
 *  named: the route's ends and every list of picks by field
 *  (features/plan/lib/fieldLists), so a pick made under "ORD" -- a runway,
 *  a procedure, an altitude, a time on the ground, a hold -- stays with
 *  KORD. Only the keys it changes. */
export function renamed(
  address: Parameters<typeof fieldListsOf>[0] & Pick<Address, "dep" | "dest">,
  from: string,
  to: string,
): AddressChange {
  const lists = fieldListsOf(address);
  const now = fieldListParams(lists),
    then = fieldListParams(renamedFieldLists(lists, from, to));
  return {
    ...(address.dep === from ? { dep: to } : {}),
    ...(address.dest === from ? { dest: to } : {}),
    ...Object.fromEntries(Object.entries(then).filter(([key, value]) => value !== now[key as keyof typeof now])),
  };
}

/** `auto` where no runway is picked for the wind: the pilot's own all. */
export const NO_AUTO = "-";

/** The runways picked into the wind ("land:KABQ", "takeoff:KEVU"), from
 *  the address's `auto`; with none (an address from before it), every
 *  runway its `pattern` and `takeoff` pick. */
export function autoOf(auto: string | null, pattern: string | null, takeoff: string | null): Set<string> {
  if (auto !== null) return new Set(auto.split(",").filter((key) => key && key !== NO_AUTO));
  return new Set([
    ...[...patternsOf(pattern).keys()].map((ident) => `land:${ident}`),
    ...[...patternsOf(takeoff).keys()].map((ident) => `takeoff:${ident}`),
  ]);
}

/** The runway each field the airplane leaves is left from, for the plan
 *  ("KSTL:30R,KMSN:36"): the takeoff picked there, else the runway landed
 *  on -- a numbered runway alone, not a pattern's other picks. `routeFields`
 *  is the route's fields comma-joined, the departure first. */
export function departureRunways(patternText: string | null, takeoffText: string | null, routeFields: string): string {
  const landing = patternsOf(patternText),
    takeoff = patternsOf(takeoffText);
  const fields = routeFields.split(",").filter(Boolean);
  return [...new Set(fields.slice(0, -1))]
    .flatMap((ident) => {
      const end = takeoff.get(ident) ?? landing.get(ident);
      return end && /^\d/.test(end) ? [`${ident}:${end}`] : [];
    })
    .join(",");
}

/** The runway each field the airplane lands at is landed on, for the
 *  plan's patterns: every field after the departure, the departure itself
 *  only on a round trip. */
export function landingRunways(patternText: string | null, routeFields: string): string {
  const landing = patternsOf(patternText);
  const fields = routeFields.split(",").filter(Boolean);
  const roundTrip = fields.length > 1 && fields[0] === fields.at(-1);
  return [...new Set(fields.slice(1))]
    .flatMap((ident) => {
      const end = ident !== fields[0] || roundTrip ? landing.get(ident) : undefined;
      return end && /^\d/.test(end) ? [`${ident}:${end}`] : [];
    })
    .join(",");
}

/** A route field's modelled or nearby category from its key
 *  ("C81:MVFR,KFAM:"), a string so the colours' callback changes only when
 *  a category does. */
export function approximateOf(key: string, ident: string): string | null {
  const found = key.split(",").find((part) => part.startsWith(`${ident}:`));
  return found ? found.slice(ident.length + 1) || null : null;
}
