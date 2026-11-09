import { useContext, useState } from "react";
import { Check } from "lucide-react";
import { ACTION } from "../../../lib/cardActions";
import { CardCloseContext } from "../../../lib/map/cards/cardClose";
import { cn } from "cn";
import { CardAction } from "../../CardAction";
import { usePointActions, type ChartPoint } from "../../../lib/map/cards/pointActions";

/**
 * A point card's actions, as an airport card's: Direct To, from where the
 * airplane is to the point and on along the route, and Add to Route, the
 * point a stop where it fits -- each while there is a route to do it to
 * (usePointActions) -- and Copy, the VOR's frequency for the radio.
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
  if (!addToRoute && !directTo && !copy) return null;
  const done = (act: (p: ChartPoint) => void) => () => {
    close();
    act({ ident: point.ident, lat: point.lat, lon: point.lon });
  };
  return (
    // As many columns as tiles, as the airport card's row fills its width.
    <div
      className={cn("grid gap-2", [directTo, addToRoute, copy].filter(Boolean).length === 3 ? "grid-cols-3" : "grid-cols-2")}
      data-testid="point-actions"
    >
      {/* The navaid card's set in its order (lib/cardActions). */}
      {directTo && (
        <CardAction
          icon={<ACTION.directTo.icon />}
          label={ACTION.directTo.label}
          filled
          onClick={done(directTo)}
          testId="point-direct-to"
        />
      )}
      {addToRoute && (
        <CardAction icon={<ACTION.addToRoute.icon />} label={ACTION.addToRoute.label} onClick={done(addToRoute)} testId={addTestId} />
      )}
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
