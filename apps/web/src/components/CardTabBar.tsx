import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { TabsIndicator, TabsList, TabsTrigger } from "./ui/tabs";
import { CARD_FOOT_ROOM } from "./sheet/insets";
import { InCardFoot } from "./sheet/CardFoot";
import { FloatingBar, FloatingBarFace } from "./FloatingBar";
import { FLOATING_BAR_COLUMNS, FLOATING_BAR_FOOT_ROOM, FLOATING_BAR_ITEM, FLOATING_BAR_PICKED, FLOATING_BAR_ROOM } from "./floatingBarLook";

/** The grabber's 16-point box (a rem) under the bar where the card's
 *  grabber is at its foot is its scroller's own room now (CardStack's
 *  GRABBER_FOOT_ROOM), so a row is never under the box either; in the
 *  inspector's column, which has no grabber, the bar keeps the same rem, so
 *  it rests as high as the side panel's beside it. */
const GRABBER_ROOM = "in-data-[slot=map-inspector]:pb-[calc(var(--bar-foot)+1rem)]";

/** One tab of the bar: its value, its word and its icon (required, so none
 *  is bare), and why to open it where there is a reason -- `hint` said in
 *  its name ("Weather, MVFR", "Charts, 14"), as the mark (`badge`) drawn
 *  over the icon's corner is not words. Every tab's name is its aria-label,
 *  as only the picked tab shows its word. */
export type CardTab<T extends string> = { value: T; label: string; icon: LucideIcon; hint?: string | null; badge?: ReactNode };

/**
 * A card's tabs in a floating bar at the card's foot, as Apple Maps' place
 * card floats its group of buttons over its content (the owner,
 * 2026-11-14, from Maps' screenshot: "Can tabs be similar to that floating
 * buttons group at the bottom?", then "fix it all"; C1 on the canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"): the airport
 * card's (PlaceTabBar) and the airplane cards' (the owner the same day:
 * "make sure the airplane card looks similar to airport card"). The stock
 * Tabs' list of icons (the owner, 2026-11-14: "can you make the tabs icons
 * instead so it takes less space?"), then made like an iOS 26
 * tab bar (the owner, 2026-11-14: "more like this with similar size and see
 * through"): the one floating bar (FloatingBar), FPL's actions' too, the
 * same height and width (the owner, 2026-11-18), centred, every tab its
 * icon with its word under it in equal columns, the picked tab in the tint
 * on the soft lighter pill, each named by its aria-label.
 *
 * The bar is glass: it floats over the card, the one place glass is kept
 * on the web (rules.md; the owner, 2026-11-10: glass only on what floats
 * over the map, its buttons), the bar's denser fill and blur, so the
 * words read on the frost over a photo, 4.5:1 or more by day and night.
 * Put last in the card's CardTabPages, which pins its pages under the head.
 */
export function CardTabBar<T extends string>({
  tabs,
  onPick,
  disabled = false,
  testId,
  tabTestId,
}: {
  tabs: CardTab<T>[];
  /** A tab picked, by a tap or the arrow keys (the APG's automatic
   *  activation: one answer fills every tab, so each shows at once). */
  onPick: (tab: T) => void;
  /** Greyed until the card's answer comes. */
  disabled?: boolean;
  testId?: string;
  /** Each trigger's test id, from its value: "place-tab-" gives "place-tab-radio". */
  tabTestId?: string;
}) {
  // The capsule of glass round the stock list, the list itself clear on it.
  const capsule = (
    <FloatingBar className="pointer-events-auto mx-auto">
      <TabsList
        activateOnFocus
        className={cn(
          "relative isolate h-auto w-full rounded-full bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto",
          FLOATING_BAR_COLUMNS,
        )}
      >
        {tabs.map((t) => (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className={cn(
              FLOATING_BAR_ITEM,
              // The picked tab in the tint, as iOS 26's tab bar, on the bar's
              // soft pill: Fly Here's blue by day, and by night the look's
              // light tint, which reads on the dark glass where the deep
              // primary read 2.4 to 2.8:1.
              // Its pill is the indicator under it (FLOATING_BAR_PICKED), so
              // the tab's own ground stays clear.
              "data-active:bg-transparent data-active:text-primary dark:data-active:border-transparent dark:data-active:bg-transparent dark:data-active:text-tint group-data-[variant=default]/tabs-list:data-active:shadow-none",
            )}
            disabled={disabled}
            aria-label={t.hint ? `${t.label}, ${t.hint}` : t.label}
            data-testid={tabTestId && `${tabTestId}${t.value}`}
            // A tap picks the tab and nothing else: the sheet keeps the size
            // it was dragged to (the owner, 2026-11-11).
            onClick={() => onPick(t.value)}
          >
            <FloatingBarFace icon={<t.icon aria-hidden />} badge={t.badge} label={t.label} />
          </TabsTrigger>
        ))}
        <TabsIndicator className={FLOATING_BAR_PICKED} />
      </TabsList>
    </FloatingBar>
  );
  // Its room: under it its foot's, over the side panel's grabber (GRABBER_ROOM), in the block it is centred in.
  const room = cn("pointer-events-none pt-3 pb-(--bar-foot)", GRABBER_ROOM, FLOATING_BAR_ROOM);
  const foot = { "--bar-foot": FLOATING_BAR_FOOT_ROOM } as CSSProperties;
  return (
    // On a phone's bottom sheet, in the card's foot slot (sheet/CardFoot),
    // which stands still at the screen's foot beside the sliding cards, so
    // the card slides behind it; nothing there at the card's pill.
    <InCardFoot
      inline={
        // Sticky at the foot of the card's scroller, the page scrolling under it;
        // in the flow at the pages' end, so its own room is the last row's room
        // to clear it. Only the capsule takes taps. No sides of its own: the
        // card's 16 points (SheetCard) are the room either side, as FPL's
        // foot's are its bar's, so the bar is capped at the same width on both.
        // Over the card's own room under its content (CARD_FOOT_ROOM): at the
        // pages' end the bar rests where it rests pinned, where it rose by that
        // room as the last page was scrolled to its end (card-scroll.spec).
        // From the side panel's width up (md, the regular width) the card's
        // grabber is at its foot, 16 points tall (SheetGrabber): the bar rests
        // over it (GRABBER_ROOM), as FPL's does (SheetFoot), where it lay on the
        // grabber's pill.
        <div
          className={cn("sticky bottom-0 z-10", room)}
          style={{ ...foot, marginBottom: `calc(-1 * ${CARD_FOOT_ROOM})` }}
          data-testid={testId}
        >
          {capsule}
        </div>
      }
    >
      <div className={room} style={foot} data-testid={testId}>
        {capsule}
      </div>
    </InCardFoot>
  );
}
