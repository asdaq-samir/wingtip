import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
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

/** Equal columns, each the widest word's, side by side. */
const COLUMNS = "inline-grid max-w-full auto-cols-fr grid-flow-col";

/** One tab of the bar: its value, its word and its icon (required, so none
 *  is bare), and why to open it where there is a reason -- `hint` said in
 *  its name ("Weather, MVFR", "Flights, 10"), as the mark (`badge`) drawn
 *  over the icon's corner is not words. Every tab's name is its aria-label,
 *  as only the picked tab shows its word. */
export type CardTab<T extends string> = { value: T; label: string; icon: LucideIcon; hint?: string | null; badge?: ReactNode };

/** An action after the tabs, in the same icon-over-word form and the same
 *  column, never picked: a tap does it (`onClick`) or follows its link
 *  (`href`, for an app's own link, which opens only from a tap on one);
 *  `name` its name to a screen reader where the word is short. */
export type CardTabAction = { label: string; name?: string; icon: LucideIcon; testId: string; onClick?: () => void; href?: string };

/** A tab's or an action's stacked icon and word, the same on both. */
const ITEM = "h-full min-w-0 flex-col gap-0.5 rounded-full";

/** The icon, its badge over its corner, and the word under it. */
function IconWord({ icon: Icon, label, badge }: { icon: LucideIcon; label: string; badge?: ReactNode }) {
  return (
    <>
      {/* The icon's own box carries the badge over its corner. */}
      <span className="relative flex shrink-0">
        <Icon aria-hidden className="size-6" />
        {badge}
      </span>
      {/* Every tab's word under its icon, the bar's columns equal; cut
          short, never spilling into the next, where five crowd a phone. */}
      <span className={cn("h-4 max-w-full truncate leading-4", TEXT.badge)}>{label}</span>
    </>
  );
}

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
 *
 * `actions` follow the tabs in the same capsule, each its own column as
 * wide as a tab's, never picked: FPL's Share and ForeFlight (the owner,
 * 2026-11-14: "the same tab bar ... with brief, navlog, profile and share,
 * and open in ForeFlight"). The tabs stay the stock tab list, the actions
 * buttons beside it, not in it (a tab list holds only tabs), the two
 * sharing the capsule's columns by a subgrid. Five or more are padded
 * less, so they fit across a phone.
 */
export function CardTabBar<T extends string>({
  tabs,
  onPick,
  disabled = false,
  testId,
  tabTestId,
  actions = [],
}: {
  tabs: CardTab<T>[];
  /** Actions after the tabs, in their form, never picked. */
  actions?: CardTabAction[];
  /** A tab picked, by a tap or the arrow keys (the APG's automatic
   *  activation: one answer fills every tab, so each shows at once). */
  onPick: (tab: T) => void;
  /** Greyed until the card's answer comes. */
  disabled?: boolean;
  testId: string;
  /** Each trigger's test id, from its value: "place-tab-" gives "place-tab-radio". */
  tabTestId: string;
}) {
  // Five or more padded less, so the five of FPL fit across a phone; the
  // airport's and the airplanes' four as they were.
  const pad = tabs.length + actions.length > 4 ? "px-1.5" : "px-3";
  return (
    // Sticky at the foot of the card's scroller, the page scrolling under it;
    // in the flow at the pages' end, so its own room is the last row's room
    // to clear it. Only the capsule takes taps.
    <div
      className={cn("pointer-events-none sticky bottom-0 z-10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", FLOATING)}
      data-testid={testId}
    >
      {/* The capsule of glass round the stock list, the list itself clear on
          it; with actions, one grid of equal columns round the list and them. */}
      <div className="liquid-glass pointer-events-auto [--glass-blur:var(--glass-bar-blur)] [--glass-fill:var(--glass-bar-fill)] mx-auto w-fit max-w-full rounded-full p-1">
        <div className={cn(actions.length > 0 && cn(COLUMNS, "h-14"))}>
          <TabsList
            activateOnFocus
            className={cn(
              "rounded-full bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-14",
              actions.length > 0 ? "grid grid-cols-subgrid" : COLUMNS,
            )}
            style={actions.length > 0 ? { gridColumn: `span ${tabs.length}` } : undefined}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  // The picked tab in the tint on a soft lighter pill, as iOS 26's tab bar, not a solid fill.
                  "group/tab flex-none data-active:bg-foreground/10 data-active:text-primary data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-foreground/15 dark:data-active:text-primary group-data-[variant=default]/tabs-list:data-active:shadow-none",
                  ITEM,
                  pad,
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
                <IconWord icon={t.icon} label={t.label} badge={t.badge} />
              </TabsTrigger>
            ))}
          </TabsList>
          {actions.map((a) => (
            <Button
              key={a.testId}
              variant="ghost"
              // As an unpicked tab: the foreground on the glass, the soft
              // pill under a pointer.
              className={cn("relative text-foreground hover:bg-foreground/10 native:text-foreground", ITEM, pad, TEXT.row, TRIGGER_AREA)}
              aria-label={a.name ?? a.label}
              data-testid={a.testId}
              onClick={a.onClick}
              {...(a.href ? { nativeButton: false, render: <a href={a.href} aria-label={a.name ?? a.label} /> } : {})}
            >
              <IconWord icon={a.icon} label={a.label} />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
