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
}
export const useSearchPick = create<{ pick: SearchPick | null; fields: number }>(() => ({ pick: null, fields: 0 }));

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
