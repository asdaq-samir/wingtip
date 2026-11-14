import { CardTabBar, TabCount } from "../../../../components/CardTabBar";
import { colourOf } from "../../../../lib/map/marks/flightCategory";

export type PlaceTab = "radio" | "weather" | "runways" | "diagrams";

/**
 * The airport card's tabs in the floating glass bar at the card's foot
 * (CardTabBar; C1, the owner, 2026-11-14), which replaces T4's tabs under
 * the actions. In the pilot's order: the radio first, named Info at the
 * owner's ask ("Rename Freq. to Info"), their values the old ones, which
 * the specs and a kept tab know them by. On two tabs why to open them --
 * Weather the dot of the field's own report's flight category, Charts how
 * many charts it has -- and their names say so too, "Weather, MVFR",
 * "Charts, 9". PlaceCard pins it.
 */
export function PlaceTabBar({
  onPick,
  disabled,
  category,
  charts,
}: {
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
  return (
    <CardTabBar<PlaceTab>
      testId="place-tab-bar"
      tabTestId="place-tab-"
      onPick={onPick}
      disabled={disabled}
      tabs={[
        { value: "radio", label: "Info" },
        {
          value: "weather",
          label: "Weather",
          hint: category,
          lead: category && (
            // The FAA's colour (AIM 7-1-7's categories, design/tokens.json
            // color.category), ringed in the picked tab's words so it reads
            // on the tint too.
            <span
              aria-hidden
              data-testid="place-tab-category"
              className="size-2 shrink-0 rounded-full group-data-active/tab:ring-2 group-data-active/tab:ring-primary-foreground"
              style={{ backgroundColor: colourOf(category) }}
            />
          ),
        },
        { value: "runways", label: "Runways" },
        {
          value: "diagrams",
          label: "Charts",
          hint: charts > 0 ? String(charts) : null,
          trail: charts > 0 && <TabCount count={charts} testId="place-tab-charts" />,
        },
      ]}
    />
  );
}
