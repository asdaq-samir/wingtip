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
  return SEARCH_WORD;
}

/** The default in the field is the one word (the owner, 2026-11-20: "just
 *  say Search"), which also fits beside the mic at the owner's larger text;
 *  its name to a screen reader keeps what it finds (WCAG 2.5.3: the name
 *  holds the word shown). */
const SEARCH_WORD = "Search";
const SEARCH_ALL = "Search airports and airplanes";

/** The one search's words: `placeholder` in the field, `label` its name.
 *  The field always says the one word (the owner, 2026-11-21: "Search for a
 *  destination" showed on a fresh load, where he asked for "Search"); what
 *  it is asked for is its name to a screen reader, and a picker's own
 *  title says it on the screen (OneSearchField). */
export function searchWords(direct: boolean, pick: SearchPick | null, picking: string) {
  const asked = placeholderOf(direct, pick, picking);
  return { label: asked === SEARCH_WORD ? SEARCH_ALL : asked, placeholder: SEARCH_WORD };
}
