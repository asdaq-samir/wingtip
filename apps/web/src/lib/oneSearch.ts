import { create } from "zustand";

/**
 * The one search's asks from outside it (the owner's one-search design,
 * 2026-11-09): ⌘K or Ctrl K, `/`, the Map menu's Search row and D for
 * Direct To each ask for the search field, which the sheet's first row
 * (OneSearchField) takes -- focused, the sheet up -- so none of them
 * needs to import the panel. It took the place of the ⌘K command palette:
 * one search, not two. `direct` asks for the airport to fly Direct To.
 */
export type SearchAsk = "all" | "direct";

export const useSearchAsk = create<{ ask: { mode: SearchAsk; at: number } | null }>(() => ({ ask: null }));

export const askSearch = (mode: SearchAsk = "all") => useSearchAsk.setState({ ask: { mode, at: Date.now() } });

/** The ask taken by the field, once. */
export const takeSearchAsk = () => useSearchAsk.setState({ ask: null });

/** Whether the keys are a Mac's (⌘) or another's (Ctrl), for what a menu
 *  and the field show beside the search. */
const onMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** The search's own keys as a menu shows them. */
export const searchKeys = (): string => (onMac() ? "⌘K" : "Ctrl K");
