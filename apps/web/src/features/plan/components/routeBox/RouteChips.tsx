import { Coffee, Fuel, PlaneLanding, PlaneTakeoff, Plus, Route, Trash2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../../../components/ui/dropdown-menu";
import type { BranchFix } from "../../../../lib/procedures";
import { TEXT } from "../../../../lib/text";

/** An instrument procedure picked at a point of the route (the route's
 *  Procedures), said in the box after the point's pill: its field, its
 *  kind, its chart's title made short ("ILS Y 08 · LAX") and in full. */
export interface RouteProcedure {
  ident: string;
  kind: "approach" | "arrival" | "departure";
  /** Its coded identifier ("I09L") and, an approach's, the runway it
   *  lands on (approachRunway), none for one circling only. */
  id: string;
  runway: string | null;
  label: string;
  spoken: string;
  /** The fix ATC sent the airplane direct to, and the procedure's fixes it
   *  could be sent to (ProcedureMenu). */
  direct?: string | null;
  fixes?: BranchFix[];
}

const PROCEDURE_GLYPH = { approach: PlaneLanding, arrival: Route, departure: PlaneTakeoff } as const;

/** A fuel stop suggested and not yet in the route (the totals' fuel_stops), in the
 *  box: a small button dashed in the caution's colour with the pump; a tap its menu, to
 *  add it to the route or take it out of the box, at the owner's ask
 *  ("Fuel stops should also have a way to delete them and add them back as
 *  pleased", 2026-10-24). A stop added is the route's own, taken out by its
 *  pill's menu as any stop is, and suggested again if the tanks need it. */
export function FuelStopChip({
  ident,
  reason = "fuel",
  onAdd,
  onHide,
}: {
  ident: string;
  reason?: "fuel" | "break";
  onAdd?: () => void;
  onHide?: () => void;
}) {
  // A break on a long flight the tanks hold wears a cup, not the pump.
  const Glyph = reason === "break" ? Coffee : Fuel;
  // The stock small Button (the owner, 2026-11-10), outlined dashed in the
  // caution's colour with the pump: suggested, not yet in the route. A
  // finger's 44 round it by a pseudo-element, the button not grown.
  const look = "relative border-dashed border-caution text-caution-ink after:absolute after:-inset-y-1.5 after:inset-x-0";
  const face = (
    <>
      <Glyph aria-hidden="true" data-icon="inline-start" />
      {ident}
    </>
  );
  const words = `Suggested ${reason === "break" ? "stop" : "fuel stop"} ${ident}`;
  if (!onHide) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onAdd}
        disabled={!onAdd}
        data-testid="route-fuel-stop"
        aria-label={`${words}: add it to the route`}
        className={look}
      >
        {face}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" data-testid="route-fuel-stop" aria-label={words} className={look} />}
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {onAdd && (
          <DropdownMenuItem onClick={onAdd} data-testid="route-fuel-stop-add">
            <Plus />
            Add to Route
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onHide} data-testid="route-fuel-stop-remove">
          <Trash2 />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A procedure picked at a point, after its pill: its kind's glyph and its
 *  short title in the approaches' indigo, as the map draws it
 *  (ProceduresGl). */
export function ProcedureChip({
  procedure,
  before = false,
  onOpen,
}: {
  procedure: RouteProcedure;
  /** Before its field's pill (an arrival, an approach), not after it. */
  before?: boolean;
  onOpen?: () => void;
}) {
  const Glyph = PROCEDURE_GLYPH[procedure.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="route-procedure"
      aria-label={`${procedure.spoken}: the route's procedures`}
      className={cn(
        before ? "relative mr-1" : "relative ml-1",
        "inline-flex h-7 shrink-0 after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] items-center gap-1 rounded-full px-1 font-semibold whitespace-nowrap text-procedure outline-none focus-visible:ring-2 focus-visible:ring-ring",
        TEXT.note,
      )}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      {procedure.label}
    </button>
  );
}
