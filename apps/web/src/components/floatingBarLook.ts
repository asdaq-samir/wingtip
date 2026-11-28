import { cn } from "cn";

/**
 * The one floating bar: a card's tabs (CardTabBar, the stock Tabs) and
 * FPL's actions (FplTabBar, the stock Toolbar) are drawn alike, the same
 * height and the same items, as iOS 26 draws one tab bar (the owner,
 * 2026-11-18: "Yes make it common. Also I meant shorter not narrower, but
 * apply the same height and width for both"; 2026-11-21: "fpl and other
 * tabs placement look different").
 *
 * Its items, not the capsule, have the one width: a column a quarter of
 * 18.75rem's capsule less its 4-point sides, 73 points at the default
 * text size, so the airport card's four tabs (Info, Weather, Runways,
 * Charts) make the capsule 300 and FPL's three actions (Brief, Nav Log,
 * More) 227, each item the same 73 where a capsule of one width spread
 * three items 97 apart, and FPL's, held to its buttons, drew them 62 (the
 * probe at 393x852, 2026-11-21). In rem, so it grows with the reader's
 * text size as the words do; never more than a quarter of the room there
 * is (the bar's room, FLOATING_BAR_ROOM, a container whose width the
 * column reads), so at the owner's 19.65 px both bars' items are 85 and a
 * four-item bar fills the room; never narrower than its words ("don't
 * make it narrow if it's not possible"): the widest word widens every
 * column alike.
 */
export const FLOATING_BAR_WIDTH = "w-fit max-w-full";

/** Its items side by side in equal columns, the capsule's and a stock
 *  list's inside it (CardTabBar's TabsList), each the one column's width
 *  or its widest word's. */
export const FLOATING_BAR_COLUMNS = "grid grid-flow-col auto-cols-[minmax(min(4.5625rem,calc((100cqi-0.5rem)/4)),1fr)]";

/** The block the bar is centred in, on a card's foot and FPL's alike: the
 *  container whose width caps the bar's columns (FLOATING_BAR_COLUMNS). */
export const FLOATING_BAR_ROOM = "@container";

/**
 * One item's look, a tab's and a button's: 48 tall (min-h-12, in rem, so
 * taller with the text rather than its word cut), its own hit area, over
 * 44 points (CLAUDE.md), the items meeting side by side. Picked, pressed
 * or its menu out, the soft lighter pill of iOS 26's tab bar, not a solid
 * fill; the stock parts' own edge, shadow and fill taken off. The picked
 * tab's pill (FLOATING_BAR_PICKED, the stock Tabs' indicator, which slides
 * from tab to tab) is the ground's own colour, by day and by night, so its word
 * in the tint reads at 4.5:1 or more: the foreground's grey wash took the
 * tint to 4.28 by day and 4.07 by night. A button with its menu out (FPL's More) is drawn so
 * too: on the foreground's wash its "More" read 4.07:1 at night.
 */
export const FLOATING_BAR_ITEM = cn(
  "h-auto min-h-12 min-w-0 flex-col justify-center gap-0 rounded-full border-0 px-2 py-0 shadow-none",
  "hover:bg-foreground/10 active:bg-foreground/10 aria-expanded:bg-background/80",
  "dark:hover:bg-foreground/15 dark:active:bg-foreground/15 dark:aria-expanded:bg-background/80",
);

/** The picked tab's pill: the stock Tabs' indicator under the tabs
 *  (CardTabBar), so the selection slides to the tab picked as iOS 26's
 *  tab bar's does, where each tab's own fill jumped. */
export const FLOATING_BAR_PICKED = "rounded-full bg-background/80";

/** The least room under the bar where there is no home indicator. */
const EDGE = "4px";

/**
 * The room under the bar, on a card and on FPL's foot alike: 4 points over
 * the screen's foot where there is no home indicator, else the indicator's
 * own inset, never less. Low, as iOS 26's tab bar sits, so FPL's figures at
 * half clear its top with a stop or a stops' row in the route (the owner's
 * check, 2026-11-18: they ran 5 to 6 points under it at 12 points of room).
 * FLOATING_BAR_FOOT_ROOM from a scroller that runs to the screen's foot (a
 * card's, CardTabBar); FLOATING_BAR_SHEET_ROOM inside a sheet whose
 * viewport already ends over the indicator (SheetDrawer), none while the
 * keyboard is up, as the sheet's own edge room (sheet/insets' EDGE_ROOM).
 */
export const FLOATING_BAR_FOOT_ROOM = `max(${EDGE}, env(safe-area-inset-bottom))`;
export const FLOATING_BAR_SHEET_ROOM = `max(0px, calc(${EDGE} - env(safe-area-inset-bottom) - var(--drawer-keyboard-inset, 0px) * 1000))`;
