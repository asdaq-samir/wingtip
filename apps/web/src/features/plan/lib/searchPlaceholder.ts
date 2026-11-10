import type { SearchPick } from "../../../lib/oneSearch";

/** What the one search says in its empty field: what it is asked for --
 *  the airport to fly Direct To, a picker's airport (its label, as each
 *  picker's own field said it), Home or a Favorite to keep -- or else all
 *  it finds. */
export function placeholderOf(direct: boolean, pick: SearchPick | null, picking: string): string {
  if (direct) return "Direct to which airport?";
  if (pick)
    return pick.fixes
      ? "Search airports and waypoints"
      : `Search for ${/^[aeiou]/i.test(pick.label) ? "an" : "a"} ${pick.label.toLowerCase()}`;
  if (picking === "home") return "Search for your home airport";
  if (picking === "favorite") return "Search for an airport to keep";
  return SEARCH_ALL;
}

/** The default's whole sentence, said to a screen reader (the field's
 *  aria-label). */
const SEARCH_ALL = "Search airports, airplanes, or ask";

/** What the empty field shows of `placeholderOf`'s words: the default cut
 *  to "Search or ask", which fits beside the mic and Cancel at the
 *  owner's larger text sizes (17.88 and 19.65 px; the sheet audit's F-S2,
 *  2026-11-10: the whole sentence ran under them); the rest as they are. */
export function shortPlaceholder(label: string): string {
  return label === SEARCH_ALL ? "Search or ask" : label;
}

/** The one search's words: `placeholder` in the field, `label` its name. */
export function searchWords(direct: boolean, pick: SearchPick | null, picking: string) {
  const label = placeholderOf(direct, pick, picking);
  return { label, placeholder: shortPlaceholder(label) };
}
