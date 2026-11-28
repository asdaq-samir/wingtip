import { TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Alert, AlertAction, AlertDescription } from "../../components/ui/alert";
import { PLANNER_UNREACHABLE, unknownWhy, type UnknownPlace } from "../../lib/api/client";
import { TEXT } from "../../lib/text";

/**
 * Under the route's box, the stock Alert in the destructive red its pill
 * is drawn in, with the one thing to do that the pill's tap does not:
 * Remove, the stock Button. The planner not reached is said as that, never
 * as a point not known (the owner's screenshot, 2026-11-23, taken while it
 * restarted). Nothing where all is well.
 */
export default function RouteBoxAlert({
  unknownPoint,
  unreachable,
  points,
  remove,
}: {
  unknownPoint: UnknownPlace | null;
  unreachable: boolean;
  points: string[];
  remove: (i: number) => void;
}) {
  if (!unknownPoint && !unreachable) return null;
  const ident = unknownPoint?.ident;
  return (
    <Alert
      variant="destructive"
      className="mt-1.5 border-0 bg-transparent px-2 py-0"
      data-testid={ident || !unreachable ? "route-unknown" : "route-unreachable"}
    >
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className={cn("text-destructive", TEXT.detail)}>
        {unknownPoint && ident
          ? `${ident} ${unknownWhy(unknownPoint)}. Tap it to change it.`
          : unreachable
            ? PLANNER_UNREACHABLE
            : "A point of the route is not an airport or waypoint we know."}
      </AlertDescription>
      {ident && points.includes(ident) && (
        <AlertAction className="top-1/2 right-0 -translate-y-1/2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove(points.indexOf(ident))}
            data-testid="route-unknown-remove"
            className="relative hit-y-1.5 after:inset-x-0"
          >
            Remove
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
