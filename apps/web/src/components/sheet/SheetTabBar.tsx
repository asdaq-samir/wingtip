import type { ReactNode } from "react";
import { Route, Search } from "lucide-react";
import { cn } from "cn";
import { GLASS } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { TAB_BAR_PX } from "./insets";
import { keepPlanTab } from "./planTab";

/**
 * The sheet's two pages, Search and FPL, peers picked from a tab bar under
 * the sheet (the owner, 2026-11-13: tab bar, option A; docs/design/rules.md
 * "One search"): FPL a tab, Search the search tab apart at the bar's
 * trailing end, as iOS 26 draws a TabView's `Tab(role: .search)`.
 */
export interface SheetPages {
  /** The page up: 0 the search's, 1 the plan's. */
  at: number;
  /** A page picked, by its tab or by the app. */
  go: (page: number) => void;
  /** Each page's name, its tab's label and a screen reader's. */
  names: readonly [string, string];
  /** The second page's body: the plan. */
  second: ReactNode;
}

/**
 * The pages' tabs, the stock Tabs (shadcn's on Base UI) whose panels
 * (SheetPage) are the sheet's two scrollers. One Root round the sheet and
 * the bar, which the Drawer's portal puts apart on the page: the Tabs tie
 * them by context and id, not by where they are drawn.
 */
export function SheetTabs({ pages, children }: { pages: SheetPages | undefined; children: ReactNode }) {
  if (!pages) return children;
  return (
    <Tabs value={pages.at} onValueChange={(value) => pages.go(Number(value))} className="contents">
      {children}
    </Tabs>
  );
}

/** A page's panel, kept when another is up: skipped by its data-hidden
 *  (index.css's tab-page), its layout and its scroll kept for its return,
 *  and inert by Base UI's own, as PanelTabs keeps the Brief's pages. */
export function SheetPage({ at, children }: { at: number; children: ReactNode }) {
  return (
    <TabsContent
      value={at}
      keepMounted
      hidden={false}
      data-sheet-page={at}
      className="tab-page flex min-h-0 flex-1 flex-col rounded-none data-hidden:flex-none focus-visible:ring-inset focus-visible:ring-offset-0"
    >
      {children}
    </TabsContent>
  );
}

/** A tab's 44-point hit area round it, never the tab grown (CLAUDE.md, The
 *  app on the phone): the shadcn trigger's own ::after is its underline,
 *  off here, so it is taken over whole -- out to its glass's edge, four
 *  points round it. */
const HIT = "after:absolute after:-inset-1! after:h-auto! after:bg-transparent! after:opacity-100! after:content-['']";
/** A tab in its glass: the page up in the tint on the tint's wash, as iOS
 *  26's selected tab is, the other in the label's own colour; over the
 *  stock trigger's own picked look (its ground and shade). */
const TAB = cn(
  "h-full! flex-none rounded-full border-0 text-foreground",
  "data-active:bg-tint/12! data-active:text-tint! data-active:shadow-none!",
  HIT,
);

/**
 * The bar: FPL in a glass capsule, Search a round glass button apart from
 * it at the trailing end. Floating over the map it is glass (the owner's
 * rule: glass only on what floats over the map); in the side panel, where
 * it sits at the panel's foot, the muted ground. Never a drag of the
 * sheet: a finger on it is its own (data-base-ui-swipe-ignore).
 */
export function SheetTabBar({ names, floating, className }: { names: SheetPages["names"]; floating: boolean; className?: string }) {
  const [searchName, planName] = names;
  const glass = cn("pointer-events-auto flex h-full rounded-full p-1", floating ? GLASS : "bg-muted");
  return (
    <TabsList
      variant="line"
      aria-label="Sheet pages"
      data-base-ui-swipe-ignore=""
      data-testid="sheet-tab-bar"
      style={{ height: TAB_BAR_PX }}
      className={cn("pointer-events-none flex w-full justify-between gap-2 rounded-none p-0 print:hidden", className)}
    >
      <div className={glass}>
        <TabsTrigger ref={keepPlanTab} value={1} data-page-tab={1} className={cn(TAB, "min-w-16 flex-col gap-0 px-3 py-0")}>
          <Route className="size-5!" aria-hidden="true" />
          <span className={cn(TEXT.tabBar, "font-semibold")}>{planName}</span>
        </TabsTrigger>
      </div>
      <div className={glass}>
        <TabsTrigger value={0} data-page-tab={0} aria-label={searchName} className={cn(TAB, "aspect-square p-0")}>
          <Search className="size-5.5!" aria-hidden="true" />
        </TabsTrigger>
      </div>
    </TabsList>
  );
}
