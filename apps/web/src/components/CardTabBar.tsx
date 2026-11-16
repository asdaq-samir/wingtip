import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { TabsList, TabsTrigger } from "./ui/tabs";
import { TEXT } from "../lib/text";

/** Held at the foot of the part of the card in sight: a phone's card is laid
 *  out at its full height and slid down by the Drawer's snap offset and the
 *  finger's movement (CardStack's --sheet-offset and --sheet-swipe), so the
 *  bar, sticky at the scroller's foot, is moved back up by the same, on the
 *  same curve and held still under a finger: SheetParts' FOLLOW, which keeps
 *  the sheet's figures at its free edge. 0 beside the side panel. */
const FLOATING =
  "[transform:translateY(calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none motion-reduce:transition-none";

/** Each trigger's hit area, the trigger itself, 56 tall in the 64-point bar
 *  (the stacked icon and word, the same on every tab so nothing moves on a
 *  switch), the triggers meeting side by side, so over 44 points: controls
 *  never grow (CLAUDE.md). `::before`, as the stock trigger's `::after` is
 *  its underline. */
const TRIGGER_AREA = "before:absolute before:inset-0 before:content-['']";

/** One tab of the bar: its value, its word and its icon (required, so none
 *  is bare), and why to open it where there is a reason -- `hint` said in
 *  its name ("Weather, MVFR", "Flights, 10"), as the mark (`badge`) drawn
 *  over the icon's corner is not words. Every tab's name is its aria-label,
 *  as only the picked tab shows its word. */
export type CardTab<T extends string> = { value: T; label: string; icon: LucideIcon; hint?: string | null; badge?: ReactNode };

/** A count over an icon's corner (the airport's charts, the airplane's flights). */
export function TabCount({ count, testId }: { count: number; testId?: string }) {
  return (
    <span
      aria-hidden
      data-testid={testId}
      className={cn(
        "pointer-events-none absolute -top-2 left-full -ml-2 min-w-4 rounded-full bg-foreground px-1 text-center leading-4 font-semibold tabular-nums text-background",
        TEXT.caption,
      )}
    >
      {count}
    </span>
  );
}

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
 * through"): a compact 64-point capsule, as narrow as its tabs need and centred, every tab its
 * icon with its word under it in equal columns, the picked tab in the tint
 * on a soft lighter pill, each named by its aria-label.
 *
 * The bar is glass (liquid-glass): it floats over the card, the one place
 * glass is kept on the web (rules.md; the owner, 2026-11-10: glass only on
 * what floats over the map, its buttons). Denser than the map buttons'
 * glass, as Apple's floating bars are: the material's bar fill and blur
 * (design/tokens.json material.bar-*) in place of the glass's own, so the
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
  testId: string;
  /** Each trigger's test id, from its value: "place-tab-" gives "place-tab-radio". */
  tabTestId: string;
}) {
  return (
    // Sticky at the foot of the card's scroller, the page scrolling under it;
    // in the flow at the pages' end, so its own room is the last row's room
    // to clear it. Only the capsule takes taps.
    <div
      className={cn("pointer-events-none sticky bottom-0 z-10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", FLOATING)}
      data-testid={testId}
    >
      {/* The capsule of glass round the stock list, the list itself clear on it. */}
      <div className="liquid-glass pointer-events-auto [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)] mx-auto w-fit max-w-full rounded-full p-1">
        <TabsList
          activateOnFocus
          className="inline-grid max-w-full auto-cols-fr grid-flow-col rounded-full bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-14"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={cn(
                // The picked tab in the tint on a soft lighter pill, as iOS 26's tab bar, not a solid fill.
                "group/tab h-full min-w-0 flex-none flex-col gap-0.5 rounded-full px-3 data-active:bg-foreground/10 data-active:text-primary data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-foreground/15 dark:data-active:text-primary group-data-[variant=default]/tabs-list:data-active:shadow-none",
                TEXT.row,
                TRIGGER_AREA,
              )}
              disabled={disabled}
              aria-label={t.hint ? `${t.label}, ${t.hint}` : t.label}
              data-testid={`${tabTestId}${t.value}`}
              // A tap picks the tab and nothing else: the sheet keeps the size
              // it was dragged to (the owner, 2026-11-11).
              onClick={() => onPick(t.value)}
            >
              {/* The icon's own box carries the badge over its corner. */}
              <span className="relative flex shrink-0">
                <t.icon aria-hidden className="size-6" />
                {t.badge}
              </span>
              {/* Every tab's word under its icon, the bar's columns equal. */}
              <span className={cn("h-4 leading-4 whitespace-nowrap", TEXT.badge)}>{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  );
}
