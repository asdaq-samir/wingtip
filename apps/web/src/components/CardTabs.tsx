import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "cn";
import { Tabs, TabsContent } from "./ui/tabs";
import { PINNED_BELOW } from "./PinnedHead";
import { Shown, useShown } from "../lib/shown";

/** The tab up, for each page to know whether it is. */
const TabUp = createContext<string | null>(null);

/**
 * A card's tab pages, laid out after Apple Maps' place card (C1, the owner,
 * 2026-11-14): the page of the tab picked, then the tabs in a glass bar
 * floating at the card's foot (CardTabBar). The airport card's
 * (PlaceCard), and the airplane cards' (AirplaneCard;
 * the owner the same day: "make sure the airplane card looks similar to
 * airport card"). The route's pages are the same stock Tabs (PanelTabs).
 *
 * - CardTabPages: the stock Tabs round a card's pages and its bar.
 * - CardTabPanel: a tab's content, spaced as every card's is.
 * - useCardTabs (lib/cardTab): the tab picked, kept for each airport or airplane while
 *   the page is open (lib/cardTab): back from a card over it, the same
 *   tab; and each tab opening at its own top, under the actions (lib/tabScroll).
 */

/** The stock Tabs round a card's pages and, last, its floating bar. `top`
 *  is useTabScroll's setter: the mark where a page starts, sticky under the
 *  card's head (PINNED_BELOW), where a tab not yet seen opens, which keeps
 *  the pages tall enough for the bar to stay at the card's foot. */
export function CardTabPages<T extends string>({
  tab,
  onPick,
  top,
  bar,
  children,
}: {
  tab: T;
  onPick: (tab: T) => void;
  top: (node: HTMLDivElement | null) => void;
  bar: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tabs value={tab} onValueChange={(next) => onPick(next as T)} className="gap-0">
      <div ref={top} aria-hidden className={cn("sticky h-0", PINNED_BELOW)} />
      <TabUp.Provider value={tab}>{children}</TabUp.Provider>
      {bar}
    </Tabs>
  );
}

/** A tab's content in a card: the space under the bar, and between its
 *  groups, every card's. Built at its first visit and kept once opened, as
 *  the route's pages are (PanelTabs): a page not up is out of the layout
 *  (display: none by Base UI's data-hidden), inert by Base UI's own, and
 *  told it is out of sight (lib/shown) so its polls and clocks stop.
 *  Skipped with its layout kept alone (index.css's tab-page), as the route's
 *  pages are, it still took room over the page up: 59 px of the airplane
 *  card's Info over Flights in WebKit, 147 in Chromium, a gap under the
 *  facts strip (the owner's iPhone, 2026-11-27, N400FJ). Unmounted at each
 *  switch, Info's pictures carousel, its NOTAM marks and the Flights list
 *  were built and asked again at every return. */
export function CardTabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  const up = useContext(TabUp) === value;
  const shown = useShown() && up;
  const [seen, setSeen] = useState(up);
  if (up && !seen) setSeen(true);
  if (!seen) return null;
  return (
    <TabsContent value={value} keepMounted hidden={false} className={cn("tab-page space-y-5 pt-4 data-hidden:hidden", className)}>
      <Shown.Provider value={shown}>{children}</Shown.Provider>
    </TabsContent>
  );
}
