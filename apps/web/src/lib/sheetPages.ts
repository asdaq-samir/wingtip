import type { ReactNode } from "react";

/**
 * The sheet's two pages, Search and FPL, turned by one round button at the
 * end of their first row (PageToggle; the owner, 2026-11-13: "Why not make
 * the same tab on the right toggle between search and fpl", and 2026-11-14,
 * where the account button was; docs/design/rules.md "One search").
 */
export interface SheetPages {
  /** The page up: 0 the search's, 1 the plan's. */
  at: number;
  /** A page picked, by the toggle or by the app. */
  go: (page: number) => void;
  /** The second page's first row, the search's row's twin and its size
   *  (FplBar): the airplane's strip and the toggle. */
  bar: ReactNode;
  /** The second page's body: the plan. */
  second: ReactNode;
  /** The second page's foot floats over it (FPL's actions' glass bar on
   *  the ground), so the page runs on under it uncut, its head passing over
   *  the bar as the sheet moves, an airport card's head over its tabs. */
  floats?: boolean;
}
