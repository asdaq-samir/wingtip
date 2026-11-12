import { PICK_KEYS } from "./address";
import type { FlightSummary } from "./api/types";

/** A local flight's time aloft is kept with the picks (lib/address PICK_KEYS). */
const KEPT_KEYS: readonly string[] = [...PICK_KEYS, "local_min"];

/** The picks of an address, as it writes them ("pattern=KMSN%3A18&…"), or
 *  "" with none; `also` the keys a caller keeps besides (a recent route
 *  its points' altitudes, which a saved flight files apart). */
export function picksOf(params: URLSearchParams, also: readonly string[] = []): string {
  const keys = [...KEPT_KEYS, ...also];
  return new URLSearchParams([...params].filter(([key]) => keys.includes(key))).toString();
}

/** A saved flight back on the planner: its route, through its stops, at
 *  its altitude and the ones the pilot set at its points, with the picks
 *  it was filed with, and for its own departure time while that is still
 *  ahead -- from its own pilot's Flights, or their instructor's review of
 *  it. One filed before its picks were kept flies its altitude, as before. */
export function planHrefOf(
  f: Pick<FlightSummary, "departureIdent" | "destinationIdent" | "stops" | "cruiseAltitudeFt" | "altitudes"> &
    Partial<Pick<FlightSummary, "picks" | "plannedFor">>,
  now = Date.now(),
): string {
  const picks = new URLSearchParams(f.picks ?? "");
  const planned = f.plannedFor ? Date.parse(f.plannedFor) : NaN;
  const params = new URLSearchParams({
    dep: f.departureIdent,
    dest: f.destinationIdent,
    ...(f.stops.length ? { stops: f.stops.join(",") } : {}),
    ...(!f.picks && f.cruiseAltitudeFt != null ? { altitude_ft: String(f.cruiseAltitudeFt) } : {}),
    ...(f.altitudes ? { altitudes: f.altitudes } : {}),
    ...(Number.isFinite(planned) && planned > now ? { depart: f.plannedFor! } : {}),
  });
  for (const [key, value] of picks) if (KEPT_KEYS.includes(key)) params.set(key, value);
  return `/plan?${params}`;
}

/** A recent route back on the planner, with what was picked for it (its
 *  `picks`, which keep a point's own altitudes besides): FPL's Recents, and
 *  the page planning them ahead (PlanWorkspace). */
export function recentHrefOf(route: { dep: string; dest: string; stops: string[]; picks?: string }): string {
  const params = new URLSearchParams({ dep: route.dep, dest: route.dest, ...(route.stops.length ? { stops: route.stops.join(",") } : {}) });
  for (const [key, value] of new URLSearchParams(route.picks ?? "")) if (!params.has(key)) params.set(key, value);
  return `/plan?${params}`;
}

/** A kept airport as a link to send (its card's own Share's). */
export const placeLink = (airport: { ident: string; name?: string | null }) => ({
  title: airport.name || airport.ident,
  url: `${location.origin}/app/plan?place=${airport.ident}`,
});

/** A kept airplane as a link to send (its card's own Share's). */
export const planeLink = (aircraft: { hex: string; name: string }) => ({
  title: aircraft.name,
  url: `${location.origin}/app/plan?flight=${aircraft.hex}`,
});
