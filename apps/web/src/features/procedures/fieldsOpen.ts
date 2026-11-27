import { create } from "zustand";

/** The runway lines opened from their fold (PatternChips), by field
 *  ("KMSN:" and the line's label): open until folded, by their head or a
 *  runway picked, or with their field (toggleField), at the owner's ask
 *  ("Keep the routes and runway opened until folded … fold them when the
 *  whole airport is collapsed", 2026-10-28), where they folded after two
 *  seconds untouched. */
export const useOpenRunwayLines = create<{ open: string[] }>(() => ({ open: [] }));

/** A runway line opened or folded, by its key: in the list once at most. */
export const setRunwayLine = (key: string, open: boolean) =>
  useOpenRunwayLines.setState((s) => ({
    open: open ? (s.open.includes(key) ? s.open : [...s.open, key]) : s.open.filter((k) => k !== key),
  }));

/** The route's fields toggled from how they start -- folded to one row --
 *  by their part and field ("Stop:KMSN"): kept while the page is, as the
 *  list is drawn again. A field folded folds its runway lines with it
 *  (`ident`), so it opens again with its runway picked showing. */
export const useToggledFields = create<{ toggled: string[] }>(() => ({ toggled: [] }));
export const toggleField = (key: string, ident: string, opening: boolean) => {
  useToggledFields.setState((s) => ({ toggled: s.toggled.includes(key) ? s.toggled.filter((k) => k !== key) : [...s.toggled, key] }));
  if (!opening) useOpenRunwayLines.setState((s) => ({ open: s.open.filter((k) => !k.startsWith(`${ident}:`)) }));
};

/** Whether the fields start opened: the browser specs' (localStorage
 *  "wingtip.fieldsOpen", as the signed-in session they share keeps it), which
 *  work on the steps' runways and procedures. Folded otherwise. */
export function fieldsOpenAtFirst(): boolean {
  try {
    return globalThis.localStorage?.getItem("wingtip.fieldsOpen") === "1";
  } catch {
    return false;
  }
}
