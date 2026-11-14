import { cn } from "cn";
import { TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { colourOf } from "../../../../lib/map/marks/flightCategory";
import { TEXT } from "../../../../lib/text";

export type PlaceTab = "radio" | "weather" | "runways" | "diagrams";

/** Held at the foot of the part of the card in sight: a phone's card is laid
 *  out at its full height and slid down by the Drawer's snap offset and the
 *  finger's movement (CardStack's --sheet-offset and --sheet-swipe), so the
 *  bar, sticky at the scroller's foot, is moved back up by the same, on the
 *  same curve and held still under a finger: SheetParts' FOLLOW, which keeps
 *  the sheet's figures at its free edge. 0 beside the side panel. */
const FLOATING =
  "[transform:translateY(calc(-1*(var(--sheet-offset,0px)+var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none motion-reduce:transition-none";

/** The card's pages, in the pilot's order: the radio first, named Info at
 *  the owner's ask ("Rename Freq. to Info"). Their values are the old
 *  ones, which the specs and a kept tab know them by. */
const PLACE_TABS: { value: PlaceTab; label: string }[] = [
  { value: "radio", label: "Info" },
  { value: "weather", label: "Weather" },
  { value: "runways", label: "Runways" },
  { value: "diagrams", label: "Charts" },
];

/** Each trigger's 44-point hit area, a pseudo-element four over and under
 *  its 40 (it was 36 in a 40-point bar, the bar's own 4 round it), the
 *  triggers' areas meeting side by side: controls never grow (CLAUDE.md).
 *  `::before`, as the stock trigger's `::after` is its underline. */
const TRIGGER_AREA = "before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

/**
 * The airport card's tabs in a floating bar at the card's foot, as Apple
 * Maps' place card floats its group of buttons over its content (the
 * owner, 2026-11-14, from Maps' screenshot: "Can tabs be similar to that
 * floating buttons group at the bottom?", then "fix it all"; C1 on the
 * canvas V1d9RDbmY1aczc4LfXed7a, "Airport card after Apple Maps"). It
 * replaces T4's tabs under the actions. The stock Tabs' list, the picked
 * tab filled in the look's tint (the `tint` variant) as a capsule, the
 * others' words in the foreground colour; on two tabs why to open them --
 * Weather the dot of the field's own report's flight category, Charts how
 * many charts it has -- and their names say so too, "Weather, MVFR",
 * "Charts, 9", as the dot and the count are not words.
 *
 * The bar is glass (liquid-glass): it floats over the card, the one place
 * glass is kept on the web (rules.md; the owner, 2026-11-10: glass only on
 * what floats over the map, its buttons). PlaceCard pins it.
 */
export function PlaceTabBar({
  onPick,
  disabled,
  category,
  charts,
}: {
  /** A tab picked, by a tap or the arrow keys (the APG's automatic
   *  activation: one answer fills every tab, so each shows at once). */
  onPick: (tab: PlaceTab) => void;
  /** Greyed until the card's answer comes. */
  disabled: boolean;
  /** The field's own report's category (the engine's flight_category);
   *  none with no report, the nearest station's or a model's not being
   *  this field's. */
  category: string | null;
  /** How many charts the Charts tab lists; 0 says nothing. */
  charts: number;
}) {
  const hint = (tab: PlaceTab): string | null => (tab === "weather" ? category : tab === "diagrams" && charts > 0 ? String(charts) : null);
  return (
    // Sticky at the foot of the card's scroller, the page scrolling under it;
    // in the flow at the pages' end, so its own room is the last row's room
    // to clear it. Only the capsule takes taps.
    <div
      className={cn("pointer-events-none sticky bottom-0 z-10 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", FLOATING)}
      data-testid="place-tab-bar"
    >
      {/* The capsule of glass round the stock list, the list itself clear on it. */}
      <div className="liquid-glass pointer-events-auto mx-auto w-fit max-w-full rounded-full p-1">
        <TabsList
          variant="tint"
          activateOnFocus
          className="max-w-full rounded-full bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-10"
        >
          {PLACE_TABS.map((t) => {
            const said = hint(t.value);
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn("group/tab h-full min-w-0 flex-none rounded-full px-3.5", TEXT.row, TRIGGER_AREA)}
                disabled={disabled}
                aria-label={said ? `${t.label}, ${said}` : undefined}
                data-testid={`place-tab-${t.value}`}
                // A tap picks the tab and nothing else: the sheet keeps the size
                // it was dragged to (the owner, 2026-11-11).
                onClick={() => onPick(t.value)}
              >
                {t.value === "weather" && category && (
                  // The FAA's colour (AIM 7-1-7's categories, design/tokens.json
                  // color.category), ringed in the picked tab's words so it reads
                  // on the tint too.
                  <span
                    aria-hidden
                    data-testid="place-tab-category"
                    className="size-2 shrink-0 rounded-full group-data-active/tab:ring-2 group-data-active/tab:ring-primary-foreground"
                    style={{ backgroundColor: colourOf(category) }}
                  />
                )}
                <span className="truncate">{t.label}</span>
                {t.value === "diagrams" && charts > 0 && (
                  <span
                    aria-hidden
                    data-testid="place-tab-charts"
                    className={cn("shrink-0 rounded-full bg-current/15 px-1.5 font-semibold tabular-nums", TEXT.caption)}
                  >
                    {charts}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
    </div>
  );
}
