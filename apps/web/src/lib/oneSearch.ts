import { create } from "zustand";

/**
 * The one search's asks from outside it (the owner's one-search design,
 * 2026-11-09): ⌘K or Ctrl K, `/`, the Map menu's Search row and D for
 * Direct To each ask for the search field, which the sheet's first row
 * (OneSearchField) takes -- focused, the sheet up -- so none of them
 * needs to import the panel. It took the place of the ⌘K command palette:
 * one search, not two. `direct` asks for the airport to fly Direct To.
 */
export type SearchAsk = "all" | "direct" | "pick";

export const useSearchAsk = create<{ ask: { mode: SearchAsk; at: number } | null }>(() => ({ ask: null }));

export const askSearch = (mode: SearchAsk = "all") => useSearchAsk.setState({ ask: { mode, at: Date.now() } });

/**
 * An airport (or a waypoint, with `fixes`) asked for by a picker -- the
 * route's departure, destination or a stop, the traffic's airport -- in
 * the one search itself, scoped to it, where each picker had a search of
 * its own over the sheet (the one card rule, the owner 2026-11-10: one
 * search field). `label` names what is asked for ("Destination"); the
 * pick goes to `onPick`, the ident as picked or as typed; `problem` says
 * why the last pick would not do, under the field. `fields` counts
 * the one searches drawn: the developer's page has none, and its pickers
 * keep their own search.
 */
export interface SearchPick {
  label: string;
  fixes: boolean;
  onPick: (ident: string) => void;
  problem?: string;
  /** Where the airplane is offered first (My Location), as Maps' From
   *  offers it: a point of the route changed, that is not it already. */
  position?: boolean;
  /** A stop asked for (FPL's Add a Stop, the route box's arrow): an
   *  airport's card opened while it is asked offers Add Stop first, in
   *  Fly Here's place, and adds the field where the pilot asked
   *  (the owner, 2026-11-18). */
  stop?: boolean;
  /** An ask that waits for the pilot to tap the field (the first flight's
   *  destination, the owner, 2026-11-13): until then the field is at rest,
   *  the page toggle beside it and no Cancel, as Apple Maps' field is
   *  before it is touched (the owner, 2026-11-19: "I see cancel on fresh
   *  load"). */
  waiting?: boolean;
  /** Its title over the suggestions, and what is in the field to start,
   *  selected so a key typed replaces it: a point changed, as Apple Maps'
   *  Change Stop opens with the stop's name in its field (the owner's
   *  screenshot, 2026-11-19). */
  title?: string;
  query?: string;
  /** Idents that cannot be picked as they stand in the route (Add a Stop:
   *  a point of it already), shown greyed "On the route already". */
  taken?: readonly string[];
}
export const useSearchPick = create<{ pick: SearchPick | null; fields: number }>(() => ({ pick: null, fields: 0 }));

/**
 * The ask the search's taps answer: a waiting one (the first flight's
 * destination) only once the pilot has used the field -- tapped it or
 * typed in it. Before that the search is at rest, and a tap on Nearest, a
 * Favorite or a Recent opens the airport's card, as outside a pick
 * (rules.md, the one search). It took the tap as the destination, and the
 * pilot's first tap is most often the nearest field, where he is: the
 * first flight then asked for the destination again (dep === dest), a
 * "Destination" picker out of nowhere (the owner's iPhone, 2026-11-23: "I
 * see this when I tap nearest airport after fresh load").
 */
export const pickInUse = (pick: SearchPick | null, used: boolean): SearchPick | null => (pick && (!pick.waiting || used) ? pick : null);

/** The one search asked to pick an airport for a picker. */
export function askSearchPick(pick: SearchPick) {
  useSearchPick.setState({ pick });
  askSearch("pick");
}

/** The ask taken by the field, once. */
export const takeSearchAsk = () => useSearchAsk.setState({ ask: null });

/** Whether the keys are a Mac's (⌘) or another's (Ctrl), for what a menu
 *  and the field show beside the search. */
const onMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The search's own keys as a menu shows them. */
export const searchKeys = (): string => (onMac() ? "⌘K" : "Ctrl K");
