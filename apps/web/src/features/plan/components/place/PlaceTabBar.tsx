import { CloudSun, FileText, Info, PlaneLanding } from "lucide-react";
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
 * "Charts, 9", their marks over the icons' corners. Each tab is an icon,
 * the picked one with its word (the owner, 2026-11-14). PlaceCard pins it.
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
        { value: "radio", label: "Info", icon: Info },
        {
          value: "weather",
          label: "Weather",
          icon: CloudSun,
          hint: category,
          badge: category && (
            // The FAA's colour (AIM 7-1-7's categories, design/tokens.json
            // color.category), ringed in the ground so it reads
            // on the tint too.
            <span
              aria-hidden
              data-testid="place-tab-category"
              className="pointer-events-none absolute -top-0.5 -right-1 size-2.5 rounded-full ring-2 ring-background"
              style={{ backgroundColor: colourOf(category) }}
            />
          ),
        },
        { value: "runways", label: "Runways", icon: PlaneLanding },
        {
          value: "diagrams",
          label: "Charts",
          icon: FileText,
          hint: charts > 0 ? String(charts) : null,
          badge: charts > 0 && <TabCount count={charts} testId="place-tab-charts" />,
        },
      ]}
    />
  );
}
