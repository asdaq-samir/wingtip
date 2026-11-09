import { ListGroup } from "../../../components/GroupedList";
import { UndoRow } from "../../../components/UndoRow";
import { dismissRouteUndo, useRouteUndo } from "../../../hooks/use-plan-history";

/**
 * The route's Undo, under the route where it was changed (RouteHead): what
 * the last change took away -- "Route Cleared", "KMSN Removed" -- and Undo
 * to give it back, gone by itself after a few seconds, as the iPhone's
 * bar over its route and every list's Undo row (components/UndoRow) are.
 * It was a toast at the screen's foot, away from the route
 * (docs/navigation.md: Undo where it happened).
 */
export default function RouteUndoBar() {
  const note = useRouteUndo((s) => s.note);
  const at = useRouteUndo((s) => s.at);
  const undo = useRouteUndo((s) => s.undo);
  if (!note || !undo) return null;
  return (
    <div className="appear pt-2" data-testid="route-undo">
      <ListGroup>
        {/* A new change is a new bar, its time from the start. */}
        <UndoRow key={at} said={note} onUndo={undo} onDone={dismissRouteUndo} testId="route-undo-row" />
      </ListGroup>
    </div>
  );
}
