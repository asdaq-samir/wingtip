import { cn } from "cn";
import { Badge } from "../../../../components/ui/badge";
import { TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import type { Metar } from "../../../../lib/api/types";
import { chipFillOf, colourOf } from "../../../../lib/map/marks/flightCategory";
import { inkOn } from "../../../../lib/scoreScale";
import { TEXT } from "../../../../lib/text";
import { weatherLineOf } from "./weatherLine";

export type PlaceTab = "radio" | "weather" | "runways" | "diagrams";

/** The card's pages, in the pilot's order, right under its actions (the
 *  owner, 2026-10-29, "bring back the tabs after the buttons"; again in
 *  T4, 2026-11-14): the radio first, named Info at the owner's ask
 *  ("Rename Freq. to Info"). Their values are the old ones, which the
 *  specs and a kept tab know them by. */
const PLACE_TABS: { value: PlaceTab; label: string }[] = [
  { value: "radio", label: "Info" },
  { value: "weather", label: "Weather" },
  { value: "runways", label: "Runways" },
  { value: "diagrams", label: "Charts" },
];

/** Each trigger's 44-point hit area, a pseudo-element eight over and under
 *  its 36, the triggers' areas meeting side by side: controls never grow
 *  (CLAUDE.md). `::before`, as the stock trigger's `::after` is its
 *  underline. */
const TRIGGER_AREA = "before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']";

/**
 * The airport card's tabs as the owner picked them (T4, 2026-11-14, canvas
 * V1d9RDbmY1aczc4LfXed7a, "Airport card tabs"): the stock Tabs' segmented
 * control, the picked tab filled in the look's tint (the `tint` variant),
 * the others' words in the foreground colour at a row's size, and on two
 * tabs why to open them -- Weather the dot of the field's own report's
 * flight category, Charts how many charts it has. Their names say so too,
 * "Weather, MVFR", "Charts, 9", as the dot and the count are not words.
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
    <TabsList variant="tint" activateOnFocus className="w-full group-data-[orientation=horizontal]/tabs:h-9">
      {PLACE_TABS.map((t) => {
        const said = hint(t.value);
        return (
          <TabsTrigger
            key={t.value}
            value={t.value}
            className={cn("group/tab min-w-0 px-1", TEXT.row, TRIGGER_AREA)}
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
  );
}

/** The field's own report in one line directly under the tabs (T4): its
 *  category in its colour -- the FAA's, as a chip's fill under the ink that
 *  reads on it (inkOn), since the colours as words fall under 4.5:1 on the
 *  night card -- then its ceiling, wind and time (weatherLineOf). Nothing
 *  where the field has no report of its own. */
export function PlaceWeatherLine({ metar }: { metar: Metar | null }) {
  if (!metar) return null;
  const category = metar.flight_category ?? null;
  const line = weatherLineOf(metar);
  if (!category && !line) return null;
  const fill = category ? chipFillOf(category) : null;
  return (
    <p className={cn("flex min-w-0 items-center gap-2 pt-3", TEXT.detail)} data-testid="place-weather-line">
      {category && fill && (
        <Badge className={cn("shrink-0 px-2 font-bold", TEXT.detail)} style={{ backgroundColor: fill, color: inkOn(fill) }}>
          {category}
        </Badge>
      )}
      {line && <span className="truncate text-muted-foreground tabular-nums">{line}</span>}
    </p>
  );
}
