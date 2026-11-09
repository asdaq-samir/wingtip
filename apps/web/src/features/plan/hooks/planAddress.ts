import type { AltitudeChoice, FuelStopSuggestion } from "../../../lib/api/types";
import { fieldListParams, fieldListsOf, renamedFieldLists } from "../../../lib/fieldLists";
import { positionIdent, stopsOf } from "../../../lib/identSchema";
import { proceduresOf, proceduresParam, sameField } from "../../../lib/procedures";
import { patternsOf } from "../../../lib/trafficPattern";
import { patched } from "../../../lib/useSearchParamsNow";
import type { SuggestedStop } from "../components/StopServices";

/**
 * The planner's address read and written, with nothing of React in it:
 * the plan is kept in the address (usePlanWorkspace), and these are the
 * pieces of it the workspace's hooks share -- a Direct to's route kept for
 * its Cancel, a field renamed everywhere it is named, the runways picked
 * into the wind -- each a function of the address, tested as one
 * (planAddress.test.ts).
 */

/** The route as the address has it this render: its ends, and the points
 *  it goes by on the way (usePlanWorkspace's `planned`). */
export interface PlannedRoute { dep: string; dest: string; stops: string[] }

export function altitudeChoiceOf(value: string | null): AltitudeChoice {
  return value === "lowest" || value === "highest" || value === "economical" ? value : "fastest";
}

/** The suggested stop at a field, where it is one of the planner's
 *  (the totals' fuel_stops): the field its flight leaves, and its figures
 *  for the field's card (PlaceCard's `stop`). */
export function suggestedStopAt(ident: string | null, suggestions: FuelStopSuggestion[]): { after: string; stop: SuggestedStop } | null {
  if (!ident) return null;
  for (const f of suggestions) {
    const found = [...f.stops, ...(f.choices ?? [])].find(c => sameField(c.ident, ident));
    if (found) {
      return {
        after: f.departure,
        stop: { reason: f.reason ?? "fuel", from: f.departure, minutes: found.minutes, landsWithGal: found.lands_with_gal, addedNm: found.added_nm },
      };
    }
  }
  return null;
}

/** The route as the address has it, "dep|stops|dest", kept as a Direct to
 *  goes in (directToPoint) for its Cancel. */
export const routeWas = (params: URLSearchParams) => `${params.get("dep") ?? ""}|${params.get("stops") ?? ""}|${params.get("dest") ?? ""}`;

/** The address's changes that give a Direct to back: the route as it was
 *  before it; none with no Direct to. */
export function routeBeforeDirect(params: URLSearchParams): Record<string, string | null> {
  const was = params.get("was");
  if (!params.has("direct") && !was) return {};
  const [dep = "", stops = "", dest = ""] = (was ?? routeWas(params)).split("|");
  return { dep: dep || null, stops: stops || null, dest: dest || null, direct: null, was: null };
}

/** The address with a Direct to a point of the route (`ident`), as ATC
 *  sends an airplane: from `fix` where the airplane is, else from the
 *  departure, on from the point as it was planned; the route as it was
 *  kept (`was`) for Cancel, and a procedure's own direct given back (one
 *  at a time). `ident` null is the Cancel; a point not on the route
 *  leaves the address as it was. */
export function directToPatch(prev: URLSearchParams, ident: string | null, fix: Parameters<typeof positionIdent>[0] | null): URLSearchParams {
  if (ident === null) return patched(prev, routeBeforeDirect(prev));
  const was = prev.get("was") ?? routeWas(prev);
  const [dep = "", stopsWere = "", dest = ""] = was.split("|");
  const stopsThen = stopsOf(stopsWere);
  const at = stopsThen.findIndex(stop => sameField(stop, ident));
  if (at < 0 && !sameField(dest, ident)) return prev;
  const procs = proceduresOf(prev.get("procs"));
  return patched(prev, {
    dep: fix ? positionIdent(fix) : dep,
    stops: at < 0 ? null : stopsThen.slice(at).join(","),
    dest, direct: ident, was,
    procs: procs.some(p => p.direct) ? proceduresParam(procs.map(p => ({ ...p, direct: null }))) || null : undefined,
  });
}

/** The address with a field's ident changed everywhere it is named: the
 *  route's ends and every list of picks by field (lib/fieldLists), so a
 *  pick made under "ORD" -- a runway, a procedure, an altitude, a time on
 *  the ground, a hold -- stays with KORD. */
export function renamed(params: URLSearchParams, from: string, to: string): URLSearchParams {
  return patched(params, {
    dep: params.get("dep") === from ? to : undefined,
    dest: params.get("dest") === from ? to : undefined,
    ...fieldListParams(renamedFieldLists(fieldListsOf(params), from, to)),
  });
}

/** `auto` where no runway is picked for the wind: the pilot's own all. */
export const NO_AUTO = "-";

/** The runways picked into the wind ("land:KABQ", "takeoff:KEVU"), from
 *  the address's `auto`; with none (an address from before it), every
 *  runway its `pattern` and `takeoff` pick. */
export function autoOf(auto: string | null, pattern: string | null, takeoff: string | null): Set<string> {
  if (auto !== null) return new Set(auto.split(",").filter(key => key && key !== NO_AUTO));
  return new Set([...[...patternsOf(pattern).keys()].map(ident => `land:${ident}`), ...[...patternsOf(takeoff).keys()].map(ident => `takeoff:${ident}`)]);
}

/** The runway each field the airplane leaves is left from, for the plan
 *  ("KSTL:30R,KMSN:36"): the takeoff picked there, else the runway landed
 *  on -- a numbered runway alone, not a pattern's other picks. `routeFields`
 *  is the route's fields comma-joined, the departure first. */
export function departureRunways(patternText: string | null, takeoffText: string | null, routeFields: string): string {
  const landing = patternsOf(patternText), takeoff = patternsOf(takeoffText);
  const fields = routeFields.split(",").filter(Boolean);
  return [...new Set(fields.slice(0, -1))].flatMap(ident => {
    const end = takeoff.get(ident) ?? landing.get(ident);
    return end && /^\d/.test(end) ? [`${ident}:${end}`] : [];
  }).join(",");
}

/** The runway each field the airplane lands at is landed on, for the
 *  plan's patterns: every field after the departure, the departure itself
 *  only on a round trip. */
export function landingRunways(patternText: string | null, routeFields: string): string {
  const landing = patternsOf(patternText);
  const fields = routeFields.split(",").filter(Boolean);
  const roundTrip = fields.length > 1 && fields[0] === fields.at(-1);
  return [...new Set(fields.slice(1))].flatMap(ident => {
    const end = ident !== fields[0] || roundTrip ? landing.get(ident) : undefined;
    return end && /^\d/.test(end) ? [`${ident}:${end}`] : [];
  }).join(",");
}

/** A route field's modelled or nearby category from its key
 *  ("C81:MVFR,KFAM:"), a string so the colours' callback changes only when
 *  a category does. */
export function approximateOf(key: string, ident: string): string | null {
  const found = key.split(",").find(part => part.startsWith(`${ident}:`));
  return found ? found.slice(ident.length + 1) || null : null;
}
