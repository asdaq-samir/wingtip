import { Route } from "lucide-react";
import { ListRow } from "../../components/GroupedList";
import type { Briefing, OnRoute } from "../../lib/api/types";
import { legLines, onRouteLine } from "../../lib/onRoute";
import { useLegHighlight } from "../../lib/legHighlight";
import { useCardSize } from "../../lib/sheetCards";

/**
 * Under a hazard's row in the Brief, where and when the flight meets it
 * -- "Legs 2–3 · 14:20–14:45, valid till 15:00", the planner's
 * (Briefing's `on_route`) -- and a tap shows those legs on the map, a
 * second puts them away: in the tint, as everything tappable is, and
 * it says so ("Show on Map"). Shown from the Brief all the way up, the
 * Brief comes down to half so the map is in sight (the owner, 2026-11-26).
 * None for a hazard the planner could not place.
 */
export default function OnRouteRow({ on, briefing, hazardKey }: { on: OnRoute | null | undefined; briefing: Briefing; hazardKey: string }) {
  const toggle = useLegHighlight((s) => s.toggle);
  const shown = useLegHighlight((s) => s.shown?.key === hazardKey);
  const card = useCardSize();
  if (!on || on.legs.length === 0) return null;
  return (
    <ListRow
      media={<Route className="size-4" aria-hidden />}
      title={onRouteLine(on)}
      value={shown ? "Hide" : "Show on Map"}
      aria-label={`${onRouteLine(on)}. ${shown ? "Shown on the map" : "Show on the map"}`}
      onClick={() => {
        toggle(hazardKey, legLines(on.legs, briefing.leg_fixes ?? []));
        if (!shown && card?.size === "full") card.setSize("half");
      }}
      data-testid="on-route"
      data-shown={shown || undefined}
    />
  );
}
