import { type ReactNode, type RefObject } from "react";
import { cn } from "cn";
import { TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

/**
 * A card's tabs: an airport's (PlaceCard), brought back under its actions
 * at the owner's ask (2026-10-29, "bring back the tabs after the
 * buttons") after a day as one scroll (A2). The airplane's card kept its
 * one scroll. The route's own pages are the same stock Tabs (PanelTabs).
 *
 * - CardTabBar: a card's bar, its tabs from a list; tapped, the panel comes
 *   all the way up, and the open one tapped again up there takes it back
 *   half way, as the route's tabs do (PanelTabs).
 * - CardTabPanel: a tab's content, spaced as every card's is.
 * - useCardTab (features/plan/lib/cardTab): the tab picked, kept for each airport while
 *   the page is open: back from a card over it, the same tab.
 */

/** A card's pages as iOS's segmented control, the stock Tabs' own look:
 *  an airport's Info, Weather, Runways and Charts, at the owner's pick of
 *  the redesign, where they were words over a hairline. 44 tall to a
 *  finger. */
const SEGMENTED = "w-full group-data-[orientation=horizontal]/tabs:h-9 pointer-coarse:group-data-[orientation=horizontal]/tabs:h-11";

interface CardTabSpec<T extends string> {
  value: T;
  label: ReactNode;
}

export function CardTabBar<T extends string>({
  tabs,
  onPick,
  testIdPrefix,
  disabled,
  barRef,
  className,
  activateOnFocus,
}: {
  tabs: readonly CardTabSpec<T>[];
  value: T;
  /** A tab picked, by a tap or the keyboard. */
  onPick: (tab: T) => void;
  /** Each trigger's test id: `${prefix}-${value}`. */
  testIdPrefix: string;
  /** Greyed, as a card's actions are until its answer comes. */
  disabled?: boolean;
  barRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  /** The tab shown as the arrow keys reach it, where every tab's content
   *  is already in hand (one answer fills them all): the APG's automatic
   *  activation, for panels shown with no delay. Base UI's Tabs wait for
   *  Enter or Space unless asked (docs/design/web.md, gap 5); the Tabs
   *  root's onValueChange is then what picks it. */
  activateOnFocus?: boolean;
}) {
  return (
    <TabsList ref={barRef} activateOnFocus={activateOnFocus} className={cn(SEGMENTED, className)}>
      {tabs.map((t) => (
        <TabsTrigger
          key={t.value}
          value={t.value}
          className="pointer-coarse:text-(length:--type-detail)"
          disabled={disabled}
          data-testid={`${testIdPrefix}-${t.value}`}
          // A tap picks the tab and nothing else: the sheet keeps the size it
          // was dragged to (the owner, 2026-11-11, "Just let the drawer do
          // what it does"; the open tab tapped again no longer lowers it).
          onClick={() => onPick(t.value)}
        >
          {t.label}
        </TabsTrigger>
      ))}
    </TabsList>
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
