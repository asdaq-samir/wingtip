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
 * One item's look, a tab's and a button's: 44 tall (min-h-11, in rem, so
 * taller with the text rather than its word cut), its own hit area, the
 * 44 points CLAUDE.md asks, the items meeting side by side; in a 2-point
 * rim the bar is 48 (the owner, 2026-11-19: "that bar can be shorter",
 * where it was 56 with too much room over and under its glyphs and words). Picked, pressed
 * or its menu out, the soft lighter pill of iOS 26's tab bar, not a solid
 * fill; the stock parts' own edge, shadow and fill taken off.
 */
export const FLOATING_BAR_ITEM = cn(
  "h-auto min-h-11 min-w-0 flex-col justify-center gap-0 rounded-full border-0 px-2 py-0.5 shadow-none",
  "hover:bg-foreground/10 active:bg-foreground/10 aria-expanded:bg-foreground/10 data-active:bg-foreground/10",
  "dark:hover:bg-foreground/15 dark:active:bg-foreground/15 dark:aria-expanded:bg-foreground/15 dark:data-active:bg-foreground/15",
);

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
