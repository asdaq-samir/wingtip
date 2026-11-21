import { flushSync } from "react-dom";
import { cn } from "cn";
import { Button } from "../../../components/ui/button";
import { FieldClearButton } from "../../../components/ui/field-clear";
import { usePlanUndo } from "../../../lib/planUndo";
import { TEXT } from "../../../lib/text";
import { EndRow, TIMELINE_CARD, TypeRouteRow } from "../../procedures";
import type { PlanSlices } from "../vm/planSlices";

type StartSlices = PlanSlices<"route" | "routeList">;

/**
 * The timeline's last row before the route is whole (the owner,
 * 2026-11-18: the empty route drawn as the whole one is): Type or Paste a
 * Route, where Add a Stop is after, opening the route's field under the
 * card (RouteEditor), focused in the tap itself, so a phone's keyboard
 * comes up with it. At its end the field's own controls while it is
 * folded, where they were at its end: half a route's ✕, and a route
 * just cleared, its Undo (the plan's one Undo, as More's is). None while
 * the field is open, which is the row then.
 */
export function TypeRow({ vm }: { vm: StartSlices }) {
  const { hasPoints, routed } = vm.route;
  const { boxOpen, clearRoute, setRouteOpen } = vm.routeList;
  const routeUndo = usePlanUndo((u) => (u.undoName === "Route" ? u.undo : null));
  if (boxOpen) return null;
  const type = () => {
    flushSync(() => setRouteOpen(true));
    document.querySelector<HTMLElement>('[data-testid="route-type"]')?.focus();
  };
  const trailing =
    hasPoints && !routed ? (
      <FieldClearButton aria-label="Clear the route" onClick={clearRoute} data-testid="route-box-clear" />
    ) : !hasPoints && routeUndo ? (
      <Button
        variant="plain"
        size="inline"
        onClick={routeUndo}
        data-testid="route-undo"
        className={cn("relative px-1 text-tint hit-2", TEXT.row)}
      >
        Undo
      </Button>
    ) : undefined;
  return <TypeRouteRow onType={type} trailing={trailing} />;
}

/** Half a route's end still to pick, before or after the one it has: its
 *  row on the timeline, the line running on from the departure to it. */
export function MissingEnd({ vm, end }: { vm: StartSlices; end: "Departure" | "Destination" }) {
  const { pickEnd } = vm.routeList;
  return <EndRow end={end} onPick={() => pickEnd(end)} line={end === "Departure"} first={end === "Departure"} />;
}

/**
 * FPL's route with no point yet, as the timeline draws a whole one (the
 * owner, 2026-11-18: "the empty fpl page looks a bit different than filled
 * one"): its card, the departure's and the destination's rows to pick, on
 * the course's line, and the route typed or pasted under them.
 */
export function EmptyRoute({ vm }: { vm: StartSlices }) {
  return (
    <div className={TIMELINE_CARD} role="group" aria-label="The route" data-testid="route-empty">
      <MissingEnd vm={vm} end="Departure" />
      <MissingEnd vm={vm} end="Destination" />
      <TypeRow vm={vm} />
    </div>
  );
}
