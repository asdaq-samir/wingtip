import type { ReactNode } from "react";
import { cn } from "cn";
import { TabsContent } from "./ui/tabs";

/**
 * A card's tab pages: an airport's (PlaceCard), brought back under its
 * actions at the owner's ask (2026-10-29, "bring back the tabs after the
 * buttons") after a day as one scroll (A2). The airplane's card kept its
 * one scroll. The airport card's bar is its own (place/PlaceTabBar, the
 * owner's T4, 2026-11-14); the route's pages are the same stock Tabs
 * (PanelTabs).
 *
 * - CardTabPanel: a tab's content, spaced as every card's is.
 * - useCardTab (features/plan/lib/cardTab): the tab picked, kept for each airport while
 *   the page is open: back from a card over it, the same tab.
 */

/** A tab's content in a card: the space under the bar, and between its
 *  groups, every card's. */
export function CardTabPanel({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  return (
    <TabsContent value={value} className={cn("space-y-5 pt-4", className)}>
      {children}
    </TabsContent>
  );
}
