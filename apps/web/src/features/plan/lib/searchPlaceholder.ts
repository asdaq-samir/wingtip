import type { SearchPick } from "../../../lib/oneSearch";

/** What the one search says in its empty field: what it is asked for --
 *  the airport to fly Direct To, a picker's airport (its label, as each
 *  picker's own field said it), Home or a Favorite to keep -- or else all
 *  it finds, "or ask" only where the assistant answers (`ask`: Claude
 *  on, lib/subscription; off by default since 2026-11-10). */
export function placeholderOf(direct: boolean, pick: SearchPick | null, picking: string, ask: boolean): string {
  if (direct) return "Direct to which airport?";
  if (pick)
    return pick.fixes
      ? "Search airports and waypoints"
      : `Search for ${/^[aeiou]/i.test(pick.label) ? "an" : "a"} ${pick.label.toLowerCase()}`;
  if (picking === "home") return "Search for your home airport";
  if (picking === "favorite") return "Search for an airport to keep";
  return ask ? "Search airports, airplanes, or ask" : "Search airports and airplanes";
}
