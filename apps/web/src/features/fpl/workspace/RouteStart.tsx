import { flushSync } from "react-dom";
import { EndRow, TIMELINE_CARD, TypeRouteButton } from "../../procedures";
import type { PlanSlices } from "../vm/planSlices";

type StartSlices = PlanSlices<"route" | "routeList">;

/**
 * The box's toggle on its timeline face, at the box's own bottom right in
 * its last row: the empty route's Destination, half a route's last row,
 * a whole route's Add a Stop (the owner, 2026-11-23: "I just want the
 * toggle between route box and grouped box to be the same area and not a
 * separate entry row"). It turns the box into the route's field in the
 * same place and at the same height (RouteEditor, inPlace), its toggle
 * pressed where this one was, so it stays under the finger. Before the
 * route is whole the field is focused in the tap itself, so a phone's
 * keyboard comes up with it.
 */
export function BoxToggle({ vm, focus = true }: { vm: StartSlices; focus?: boolean }) {
  const { typeInPlace } = vm.routeList;
  return (
    <TypeRouteButton
      pressed={false}
      onToggle={() => {
        if (!focus) return typeInPlace();
        flushSync(typeInPlace);
        document.querySelector<HTMLElement>('[data-testid="route-type"]')?.focus();
      }}
    />
  );
}

/** Half a route's end still to pick, before or after the one it has: its
 *  row on the timeline, the line running on from the departure to it; the
 *  destination's, the card's last row, ends in the box's toggle. */
export function MissingEnd({ vm, end }: { vm: StartSlices; end: "Departure" | "Destination" }) {
  const { boxOpen, pickEnd } = vm.routeList;
  return (
    <EndRow
      end={end}
      onPick={() => pickEnd(end)}
      line={end === "Departure"}
      first={end === "Departure"}
      // None while the field is open under the card (a stop being typed),
      // whose own toggle is the one then.
      trailing={end === "Destination" && !boxOpen ? <BoxToggle vm={vm} /> : undefined}
    />
  );
}

/**
 * FPL's route with no point yet, as the timeline draws a whole one (the
 * owner, 2026-11-18: "the empty fpl page looks a bit different than filled
 * one"): its card, the departure's and the destination's rows to pick, on
 * the course's line, the box's toggle at the destination's end. No route
 * file is opened here (the owner, 2026-11-23: "No need for open a route
 * file"); the field's ✕ and Undo are the field's own (RouteBox).
 */
export function EmptyRoute({ vm }: { vm: StartSlices }) {
  return (
    <div className={TIMELINE_CARD} role="group" aria-label="The route" data-testid="route-empty">
      <MissingEnd vm={vm} end="Departure" />
      <MissingEnd vm={vm} end="Destination" />
    </div>
  );
}
