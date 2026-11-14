import { TYPE_CLASS, TYPE_POINTS } from "./tokens";

/**
 * The app's text sizes, by what the words are: as iOS sets them on a
 * touch screen -- a row's name 17 points, the line under it 15, a note
 * 13 (the Body, Subheadline and Footnote text styles), a drawer's title
 * 17 and semibold, as a navigation bar's is -- and as the app always
 * has with a mouse, 16, 14 and 12. One place says them, so every list,
 * section and sheet reads alike: on a phone they were 12 and 14
 * everywhere but the waypoint list. (A title of 20 put "Flight
 * Planning" on two lines beside its three toolbar buttons.)
 *
 * A touch screen, not a narrow one, decides: a phone on its side and
 * an iPad are as wide as a small desktop and are still read at arm's
 * length and worked with a finger, which is the test the 44-point hit
 * areas in index.css go by too. All in rem, so all of it grows with
 * the text size. Class strings rather than theme utilities, so `cn`
 * knows each for a font size and keeps it beside a colour; the sizes are
 * design/tokens.json's type roles, written as classes by
 * scripts/build/design-tokens.sh (lib/tokens TYPE_CLASS).
 */
export const TEXT = {
  /** A card's name at its top (CardTitle), with font-bold: iOS's
   *  Title 1, 28 on 34, as Maps sets a place's over its photos. */
  hero: TYPE_CLASS.hero,
  /** A card's name -- an airport's, the airspace's, Nearest's, a console
   *  page's -- with font-bold: 22 on 28 (iOS Title 2), the same with a
   *  mouse. */
  card: TYPE_CLASS.card,
  /** A drawer's or a sheet's own title, with font-semibold: 17, and 16 with a mouse. */
  title: TYPE_CLASS.title,
  /** A section's title in the planning panel's tabs, with font-semibold:
   *  20 on its 25 leading (iOS Title 3), and 18 with a mouse -- above a
   *  row's 17, where the same size in a heavier weight read as one more
   *  row (the tabs' content audit, 2026-10-07). */
  heading: TYPE_CLASS.heading,
  /** A row's name and its value, a section's title: 17, 14. */
  row: TYPE_CLASS.row,
  /** The line under a row's name: 15, 12. */
  detail: TYPE_CLASS.detail,
  /** What is read rather than scanned -- a section's summary, a
   *  paragraph, the message where rows will be: 15, 14. */
  prose: TYPE_CLASS.prose,
  /** A section's line of help, a group's heading and its note, a key: 13, 12. */
  note: TYPE_CLASS.note,
  /** A StatusBadge's word (Active, Closed, In the air), semibold: iOS's
   *  Caption 1, 12 on 16, the same with a mouse. */
  badge: TYPE_CLASS.badge,
  /** A chip's category inside a column the width of the star, with
   *  font-bold: iOS's Caption 2, 11 on 13, the same with a mouse. */
  caption: TYPE_CLASS.caption,
  /** The tab bar's words: iOS's Footnote, 13 on 17, two sizes up from its
   *  tab bar's Caption 2, at the owner's asks ("make the label font and icon
   *  size a bit bigger so it fits nicely"; the tabs to "pop out more",
   *  2026-10-22). */
  tab: TYPE_CLASS.tab,
  /** The tab bar's words: 12, a size under the 13 they were, for a
   *  slimmer bar with room round its tabs (the owner, 2026-11-04: 49
   *  points "seems too congested and small"), on iOS's own 16 for 12
   *  (Caption 1, 12/16; the iOS audit's P3). 14 failed the audit on every
   *  screen with the tabs; the tab is 50 tall, so the bar keeps its height. */
  tabBar: TYPE_CLASS.tabBar,
  /** A figure's name, an ident, a chip's word in the display face
   *  (index.css --display: Barlow Condensed in the Chart ink look, the
   *  body's own face in the others): a note's 13 on 17, semibold, in
   *  capitals spaced a tenth of an em, as the ink canvas sets a figure's
   *  label (2026-11-04). */
  label: TYPE_CLASS.label,
  /** A figure in the Chart ink look (FigureStrip): 26 on 31, bold, in
   *  tabular figures -- the Flying screen's size (FLYING_FIGURE), a
   *  weight up, in the text face. */
  figure: TYPE_CLASS.figure,
  /** A word button's words (the strip layout's): the display face's
   *  capitals, semibold, spaced 0.08em; its size the button's own. */
  word: TYPE_CLASS.word,
} as const;

/** A section's title, the one look every section of a tab, card and
 *  sheet has (SectionTitle): 20 points in Title Case (18 with a mouse),
 *  medium -- the owner's 20-point section titles (decision 0021), not
 *  bold and not capitals ("Section labels don't need to be bold or all
 *  caps", 2026-10-23). */
export const SECTION_TITLE = `font-medium text-foreground ${TEXT.heading}`;

/** A group's heading, as iOS's grouped lists set one: a note's size,
 *  semibold, in capitals, spaced out and grey. Over a list's box
 *  (ListGroup), the nav log's columns, a popover's parts -- one look,
 *  where the nav log's were a row's size in black, at the pilot's ask. */
export const GROUP_HEADING = `font-semibold uppercase tracking-wide text-muted-foreground ${TEXT.note}`;

/** The sizes of text drawn in points rather than by class (the runway
 *  sketch's numbers in an SVG): TEXT.caption's 11 and TEXT.row's 17 as
 *  a touch screen sets them. */
export const TEXT_POINTS = { caption: TYPE_POINTS.caption, row: TYPE_POINTS.row } as const;

/** A figure pinned at the map panel's foot (FlightLine, FigureStrip), its
 *  value, unit and name small at half and their own size at the pill and
 *  all the way up (MapPanel's --sheet-progress, 0 at half, 1 at the other
 *  two; the owner, 2026-11-05), each with its iOS leading at either end (the audit's P3: 15
 *  on 20 to 20 on 25, 11 on 13 to 13 on 18), eased between as the size
 *  is. */
const GROW_SMALL =
  "text-[length:calc(0.6875rem+0.0625rem*var(--sheet-progress,1))] leading-[calc(0.8125rem+0.1875rem*var(--sheet-progress,1))] pointer-coarse:text-[length:calc(0.6875rem+0.125rem*var(--sheet-progress,1))] pointer-coarse:leading-[calc(0.8125rem+0.3125rem*var(--sheet-progress,1))]";
export const GROW_FIGURE = {
  value:
    "text-[length:calc(0.75rem+0.375rem*var(--sheet-progress,1))] leading-[calc(1rem+0.75rem*var(--sheet-progress,1))] pointer-coarse:text-[length:calc(0.9375rem+0.3125rem*var(--sheet-progress,1))] pointer-coarse:leading-[calc(1.25rem+0.3125rem*var(--sheet-progress,1))]",
  unit: GROW_SMALL,
  name: GROW_SMALL,
};

/** The same figures in flight (useFlyingMode): one size whatever the
 *  sheet's, read at arm's length in a bumpy cockpit -- the value 26 on
 *  31, its unit 14 and its name 12 on 16, as the canvas draws the Flying
 *  screen (2026-11-03). */
export const FLYING_FIGURE = {
  value: "text-(length:--type-figure) leading-[1.9375rem]",
  unit: "text-sm leading-[1.125rem]",
  name: "text-xs leading-4",
};
