import type { ReactNode } from "react";

/**
 * The sheet's two pages, Search and FPL, turned by one round glass button
 * riding the sheet's top at the right (PageToggle; the owner, 2026-11-13:
 * "Why not make the same tab on the right toggle between search and fpl";
 * docs/design/rules.md "One search").
 */
export interface SheetPages {
  /** The page up: 0 the search's, 1 the plan's. */
  at: number;
  /** A page picked, by the toggle or by the app. */
  go: (page: number) => void;
  /** The second page's body: the plan. */
  second: ReactNode;
}

/** A page's body, kept when the other is up: skipped by its data-hidden
 *  (index.css's tab-page), its layout and its scroll kept for its return,
 *  and inert, out of the way of the keys and VoiceOver, as PanelTabs keeps
 *  the Brief's pages. */
export function SheetPage({ at, up, children }: { at: number; up: boolean; children: ReactNode }) {
  return (
    <div
      data-sheet-page={at}
      data-hidden={up ? undefined : ""}
      inert={!up}
      className="tab-page flex min-h-0 flex-1 flex-col data-hidden:flex-none"
    >
      {children}
    </div>
  );
}
