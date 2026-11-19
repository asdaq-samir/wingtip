import { Redo2, Undo2 } from "lucide-react";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { usePlanUndo } from "../../lib/planUndo";

/**
 * The plan's Undo and Redo, first in the route's ••• menu as iOS puts Undo
 * first in an edit menu: the one place every FPL edit -- the route, the
 * altitude, the procedures and stops, the departure time, the airplane --
 * is taken back (lib/planUndo; the FPL redesign, the owner 2026-11-17),
 * on a phone with no keyboard as on a desk. Each says what it puts back
 * ("Undo Altitude"); only those that can act are there, so a plan just
 * opened shows none.
 */
export default function PlanUndoItems() {
  const { undoName, redoName, undo, redo } = usePlanUndo();
  if (!undoName && !redoName) return null;
  return (
    <>
      {undoName && (
        <DropdownMenuItem onClick={undo} data-testid="plan-undo">
          <Undo2 />
          Undo {undoName}
        </DropdownMenuItem>
      )}
      {redoName && (
        <DropdownMenuItem onClick={redo} data-testid="plan-redo">
          <Redo2 />
          Redo {redoName}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
    </>
  );
}
