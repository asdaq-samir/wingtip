import type { ReactNode } from "react";
import { cn } from "cn";
import { Tabs, TabsContent } from "./ui/tabs";
import { PINNED_BELOW } from "./PinnedHead";

/**
 * A card's tab pages, laid out after Apple Maps' place card (C1, the owner,
 * 2026-11-14): the page of the tab picked, then the tabs in a glass bar
 * floating at the card's foot (CardTabBar). The airport card's
 * (PlaceCard), and the airplane cards' (AirplaneProfileSheet, FlightCard;
 * the owner the same day: "make sure the airplane card looks similar to
 * airport card"). The route's pages are the same stock Tabs (PanelTabs).
 *
 * - CardTabPages: the stock Tabs round a card's pages and its bar.
 * - CardTabPanel: a tab's content, spaced as every card's is.
 * - useCardTab (lib/cardTab): the tab picked, kept for each airport or
 *   airplane while the page is open: back from a card over it, the same tab.
 * - useTabScroll (lib/tabScroll): each tab opening at its own top, under the actions.
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
      {children}
      {bar}
    </Tabs>
  );
}

/** A tab's content in a card: the space under the bar, and between its
 *  groups, every card's. */
export function CardTabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  return (
    <TabsContent value={value} className={cn("space-y-5 pt-4", className)}>
      {children}
    </TabsContent>
  );
}
