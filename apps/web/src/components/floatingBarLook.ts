import { cn } from "cn";

/**
 * The one floating bar: a card's tabs (CardTabBar, the stock Tabs) and
 * FPL's actions (FplTabBar, the stock Toolbar) are drawn alike, the same
 * height and the same width, as iOS 26 draws one tab bar (the owner,
 * 2026-11-18: "Yes make it common. Also I meant shorter not narrower, but
 * apply the same height and width for both").
 *
 * Its width: 18.75rem, 300 points at the default text size, wide enough
 * for the bars with the most items -- the airport card's four (Info,
 * Weather, Runways, Charts) and FPL's four (Brief, Nav Log, Profile,
 * More) -- in equal columns round the widest word, "Runways", with room
 * to spare (about 46 of a column's 73 at the default size). In rem, so it
 * grows with the reader's text size as the words do, and the same on a
 * card and on the sheet at every size; never wider than the room there
 * is, nor narrower than its words ("don't make it narrow if it's not
 * possible"): it is the least width, and a bar whose words need more
 * (a text size past what dynamicType allows) takes more.
 */
export const FLOATING_BAR_WIDTH = "w-fit min-w-[min(18.75rem,100%)] max-w-full";

/** Its items side by side in equal columns, the capsule's and a stock
 *  list's inside it (CardTabBar's TabsList). */
export const FLOATING_BAR_COLUMNS = "grid auto-cols-fr grid-flow-col";

/**
 * One item's look, a tab's and a button's: 48 tall (min-h-12, in rem, so
 * taller with the text rather than its word cut), its own hit area, over
 * 44 points (CLAUDE.md), the items meeting side by side. Picked, pressed
 * or its menu out, the soft lighter pill of iOS 26's tab bar, not a solid
 * fill; the stock parts' own edge, shadow and fill taken off.
 */
export const FLOATING_BAR_ITEM = cn(
  "h-auto min-h-12 min-w-0 flex-col justify-center gap-0.5 rounded-full border-0 px-2 py-0.5 shadow-none",
  "hover:bg-foreground/10 active:bg-foreground/10 aria-expanded:bg-foreground/10 data-active:bg-foreground/10",
  "dark:hover:bg-foreground/15 dark:active:bg-foreground/15 dark:aria-expanded:bg-foreground/15 dark:data-active:bg-foreground/15",
);
