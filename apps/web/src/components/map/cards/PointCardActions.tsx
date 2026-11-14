import { useContext, useState } from "react";
import { Check } from "lucide-react";
import { ACTION } from "../../../lib/cardActions";
import { CardCloseContext } from "../../../lib/map/cards/cardClose";
import { cn } from "cn";
import { CardAction } from "../../CardAction";
import { usePointActions, type ChartPoint } from "../../../lib/map/cards/pointActions";

/**
 * A point card's actions, as an airport card's: Direct To, the plan's own
 * (usePlanSetters' directToChartPoint), from where the airplane is to the
 * point and on along the route, and Add to Route, the point a waypoint
 * where it bends the route least -- each live while there is a route to
 * do it to (usePointActions), and there but greyed while not, so the row
 * is the same full row on every point's card (the owner's iPhone,
 * 2026-11-14: one half-width tile on OBK's) -- and Copy, the VOR's
 * frequency for the radio, its word "Copied" in place once it is.
 */
export function PointActions({
  point,
  copy,
  addTestId = "point-add",
}: {
  point: ChartPoint;
  copy: { label: string; text: string } | null;
  /** Its Add to Route's test id where a spec had one before (a VFR waypoint's). */
  addTestId?: string;
}) {
  const close = useContext(CardCloseContext);
  const { addToRoute, directTo } = usePointActions();
  const [copied, setCopied] = useState(false);
  const done = (act: (p: ChartPoint) => void) => () => {
    close();
    act({ ident: point.ident, lat: point.lat, lon: point.lon });
  };
  return (
    // As many columns as tiles, as the airport card's row fills its width.
    <div className={cn("grid gap-2", copy ? "grid-cols-3" : "grid-cols-2")} data-testid="point-actions">
      {/* The navaid card's set in its order (lib/cardActions). */}
      <CardAction
        icon={<ACTION.directTo.icon />}
        label={ACTION.directTo.label}
        filled
        disabled={!directTo}
        spoken={directTo ? undefined : `${ACTION.directTo.label}: needs a route and your position`}
        onClick={directTo ? done(directTo) : undefined}
        testId="point-direct-to"
      />
      <CardAction
        icon={<ACTION.addToRoute.icon />}
        label={ACTION.addToRoute.label}
        disabled={!addToRoute}
        spoken={addToRoute ? undefined : `${ACTION.addToRoute.label}: needs a route`}
        onClick={addToRoute ? done(addToRoute) : undefined}
        testId={addTestId}
      />
      {copy && (
        <CardAction
          icon={copied ? <Check /> : <ACTION.copy.icon />}
          label={copied ? "Copied" : copy.label}
          spoken={`Copy ${copy.label}`}
          onClick={() => {
            // Called in the tap, as the clipboard asks; refused, nothing said.
            void navigator.clipboard?.writeText(copy.text).then(
              () => setCopied(true),
              () => {},
            );
          }}
          testId="point-copy"
        />
      )}
    </div>
  );
}
