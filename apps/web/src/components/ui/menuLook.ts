import { MATERIAL } from "../../lib/mapChrome";
import { TEXT } from "../../lib/text";

/**
 * iOS's menu, for every menu the app opens -- a pull-down's choices
 * (PullDown), an action menu (dropdown-menu) and a held row's (context-menu)
 * -- one look, where each had shadcn's small grey box: a 14-point corner
 * on the light material, the map blurred through it, rows edge to edge
 * with a hairline between them and a wider grey band between groups.
 *
 * In the Native look each part is shadcn's stock dropdown menu's instead
 * (the native: classes, base-vega's): a small solid popover with a ring,
 * rounded rows at text-sm highlighted in the accent, a hairline between
 * groups (the owner, 2026-11-10: Native is "how they come out of the box").
 */
const STOCK_CONTENT =
  "native:min-w-32 native:p-1 native:bg-popover native:text-popover-foreground native:shadow-md native:ring-1 native:ring-foreground/10";
const STOCK_ITEM =
  "native:rounded-sm native:px-2 native:py-1.5 native:border-t-0 native:text-sm native:leading-5 native:focus:bg-accent native:focus:text-accent-foreground native:data-highlighted:bg-accent native:data-highlighted:text-accent-foreground";

export const MENU_CONTENT = `min-w-56 rounded-(--radius-control) p-0 shadow-md ring-1 ring-foreground/10 ${MATERIAL} ${STOCK_CONTENT}`;

/** A row: 44 points to a finger, as iOS's menus' rows and the grouped
 *  lists' are (GroupedList), a row's words (TEXT.row), and the hairline
 *  over it but for the first and one after a group's band or heading.
 *  The row is the control, its own height its hit area. */
export const MENU_ITEM = `relative flex cursor-default items-center gap-2 rounded-none px-4 py-2 pointer-coarse:min-h-11 outline-hidden select-none border-t border-foreground/10 first:border-t-0 [[data-slot$=separator]+&]:border-t-0 [[data-slot$=label]+&]:border-t-0 focus:bg-foreground/8 data-highlighted:bg-foreground/8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${TEXT.row} ${STOCK_ITEM}`;

/** A picked-one row (radio or checkbox): its checkmark on the left, as
 *  iOS puts it, the words lined up whether or not it is ticked. */
export const MENU_CHECK_ITEM = `${MENU_ITEM} pl-10 native:pl-8`;

/** Where the checkmark sits in such a row. */
export const MENU_CHECK = "pointer-events-none absolute left-3.5 flex size-4 items-center justify-center text-foreground native:left-2";

/** Between groups: iOS's band, not a line. */
export const MENU_SEPARATOR = "mx-0 my-0 h-2 bg-foreground/8 native:-mx-1 native:my-1 native:h-px native:bg-border";

/** A group's heading in a menu. */
export const MENU_LABEL = `px-4 pt-2 pb-1 font-medium text-muted-foreground ${TEXT.note} native:px-2 native:py-1.5`;
