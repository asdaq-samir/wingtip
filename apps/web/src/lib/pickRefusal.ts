import { closedOf, type AirportIndex } from "./airportIndex";
import type { SearchPick } from "./oneSearch";

/**
 * Why an airport cannot be picked for the point the one search is asked
 * for, in the words shown greyed beside it (the owner, 2026-11-21); null
 * where it can. A closed field is never offered (decision 0043; the
 * engine's field_status through the airport index, never compared by
 * hand), and Add a Stop does not take a point the route has already.
 */
export function pickRefusal(pick: SearchPick | null, index: AirportIndex | null, ident: string): string | null {
  if (!pick || !ident) return null;
  if (closedOf(index, ident)) return "Closed";
  const upper = ident.toUpperCase();
  return pick.taken?.some((t) => t.toUpperCase() === upper) ? "On the route already" : null;
}
