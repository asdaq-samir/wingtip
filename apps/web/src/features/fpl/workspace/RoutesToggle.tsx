import { cn } from "cn";
import { Toggle } from "../../../components/ui/toggle";
import { TEXT } from "../../../lib/text";

/**
 * "Route Options", a tinted pill under FPL's title, as Apple Maps' "Time
 * and Options" is under "Directions" (the owner, 2026-11-19: "more route
 * options pill under the flight plan title like Apple Maps"), where it was
 * a signpost disc at the first row's start (the owner, 2026-11-17: "Which
 * shows route pills just above the stops"): the stock Toggle, pressed
 * while the suggested routes' pills are out above the route (FplRoute) and
 * their ways on the map (PlanMap), filled in the tint while on, its
 * 44-point area a pseudo-element round its 28. Whether they are out is the
 * plan's (useRoutesShown), put away as the route changes; drawn only while
 * there are ways to offer (routesOffered).
 */
export function RoutesToggle({ shown, onShown }: { shown: boolean; onShown: (shown: boolean) => void }) {
  return (
    <Toggle
      pressed={shown}
      onPressedChange={onShown}
      data-testid="routes-toggle"
      className={cn(
        "relative h-7 shrink-0 rounded-full bg-tint/12 px-3 font-semibold text-tint after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:bg-tint/20 data-pressed:bg-tint data-pressed:text-white print:hidden",
        TEXT.detail,
      )}
    >
      Route Options
    </Toggle>
  );
}
