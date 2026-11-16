import type { SearchPick } from "../../../lib/oneSearch";

/** What the one search says in its empty field: what it is asked for --
 *  the airport to fly Direct To, a picker's airport (its label, as each
 *  picker's own field said it), Home, a Favorite, the pilot's Airplane or
 *  an airplane to keep -- or else all it finds. */
export function placeholderOf(direct: boolean, pick: SearchPick | null, picking: string): string {
  if (direct) return "Direct to which airport?";
  if (pick)
    return pick.fixes
      ? "Search airports and waypoints"
      : `Search for ${/^[aeiou]/i.test(pick.label) ? "an" : "a"} ${pick.label.toLowerCase()}`;
  if (picking === "home") return "Search for your home airport";
  if (picking === "favorite") return "Search for an airport to keep";
  // The airplanes' Adds, which the traffic's own field said (2026-11-14).
  if (picking === "mine") return "Search for your airplane";
  if (picking === "airplane") return "Search for an airplane to keep";
  return SEARCH_ALL;
}

/** The default, in the field and to a screen reader alike: the owner,
 *  2026-11-14, "Just say Search airports and airplanes" (it was cut to
 *  "Search airports" on 2026-11-10 to fit beside the mic at the owner's
 *  larger text sizes; the whole words now, cut by the field only where
 *  they cannot fit). */
const SEARCH_ALL = "Search airports and airplanes";

/** The one search's words: `placeholder` in the field, `label` its name. */
export function searchWords(direct: boolean, pick: SearchPick | null, picking: string) {
  const label = placeholderOf(direct, pick, picking);
  return { label, placeholder: label };
}
