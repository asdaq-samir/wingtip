import type { ReactNode } from "react";
import { Coffee, Fuel, PlaneLanding, PlaneTakeoff, Plus, Route, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { SwipeRow } from "../../components/SwipeRow";
import type { BranchFix } from "../../lib/procedures";
import { TEXT } from "../../lib/text";

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
  /** Its name as the FAA's list gives it ("RNAV (GPS)-B"), and as the
   *  route says it, with its transition or the fix it was sent to. */
  name?: string;
  label: string;
  spoken: string;
  /** The fix ATC sent the airplane direct to, and the procedure's fixes it
   *  could be sent to (ProcedureMenu). */
  direct?: string | null;
  fixes?: BranchFix[];
  /** An approach loaded, not in the route flown until activated; and,
   *  activated, its missed approach unsuspended (lib/procedures). */
  loaded?: boolean;
  missed?: boolean;
  /** Its missed approach's fixes, the MAP to its hold (the engine's
   *  procedure_missed, AIM 5-4-21), and the MAP the route is suspended at. */
  missedFixes?: BranchFix[];
  suspendAt?: string | null;
}

const PROCEDURE_GLYPH = { approach: PlaneLanding, arrival: Route, departure: PlaneTakeoff } as const;

/** A suggested stop's look, one or a flight's folded (SuggestedPill, below). */
const FUEL_CHIP =
  "relative h-7 gap-1 rounded-full border-dashed border-caution px-1.5 font-semibold text-caution-ink hit-y-2 after:inset-x-0 hover:text-caution-ink native:text-caution-ink";

/** A fuel stop suggested and not yet in the route (the totals' fuel_stops), in the
 *  box: a small button dashed in the caution's colour with the pump. One tap puts
 *  it in the route where it is drawn, no menu between (the owner, 2026-11-23); a
 *  swipe to the left dismisses it for this plan, as iOS's rows go (SwipeRow), and
 *  so do its held or right-clicked menu's Dismiss and Delete on it, for a mouse,
 *  a keyboard and VoiceOver ("Fuel stops should also have a way to delete them
 *  and add them back as pleased", 2026-10-24). A stop added is the route's own,
 *  taken out by its pill's menu as any stop is, and suggested again if the tanks
 *  need it. */
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
  const words = `Suggested ${reason === "break" ? "stop" : "fuel stop"} ${ident}`;
  return (
    <SuggestedPill
      onAdd={onAdd}
      onHide={onHide}
      label={`${words}: add it to the route`}
      dismissLabel={`Dismiss ${words}`}
      shortcuts="Delete"
      testId="route-fuel-stop"
      menu={
        <ContextMenuGroup>
          <ContextMenuLabel>{words}</ContextMenuLabel>
          {onAdd && (
            <ContextMenuItem onClick={onAdd} data-testid="route-fuel-stop-add">
              <Plus aria-hidden="true" />
              Add to Route
            </ContextMenuItem>
          )}
          <ContextMenuItem variant="destructive" onClick={onHide} data-testid="route-fuel-stop-remove">
            <X aria-hidden="true" />
            Dismiss
          </ContextMenuItem>
        </ContextMenuGroup>
      }
    >
      <Glyph aria-hidden="true" className="size-3.5" />
      {ident}
    </SuggestedPill>
  );
}

/**
 * A suggested stop's pill, one stop's (FuelStopChip) or a flight's folded
 * (FuelStopFold), one interaction written once (the r10 audit): the stock
 * Button (the owner, 2026-11-10) at the pills' size, 28 tall, round, the
 * detail's type in their weight, so the line reads as one row of pills
 * (RoutePill). One dashed border on the button itself, in the fuel's amber
 * (FUEL_CHIP): the outline variant's 10-point corners under SwipeRow's
 * round clip showed the dashes only along the top and bottom, the sides
 * cut to a stray ":" (the owner's iPhone, 2026-11-23). A finger's 44 round
 * it by a pseudo-element, the button not grown. A tap adds; where it can
 * be dismissed, Delete or Backspace, a swipe to the left (SwipeRow) and
 * its held or right-clicked menu (`menu`) do.
 */
export function SuggestedPill(p: {
  onAdd?: () => void;
  onHide?: () => void;
  label: string;
  dismissLabel: string;
  /** Its keys said to a screen reader where it can be dismissed. */
  shortcuts: string;
  testId: string;
  count?: number;
  menuTestId?: string;
  menu: ReactNode;
  children: ReactNode;
}) {
  const { onHide } = p;
  const pill = (
    <Button
      variant="ghost"
      onClick={p.onAdd}
      disabled={!p.onAdd}
      onKeyDown={(e) => {
        if (onHide && (e.key === "Delete" || e.key === "Backspace")) {
          e.preventDefault();
          e.stopPropagation();
          onHide();
        }
      }}
      data-testid={p.testId}
      data-count={p.count}
      aria-label={p.label}
      aria-keyshortcuts={onHide ? p.shortcuts : undefined}
      className={cn(FUEL_CHIP, TEXT.detail)}
    >
      {p.children}
    </Button>
  );
  if (!onHide) return pill;
  return (
    <SwipeRow chip word="Dismiss" label={p.dismissLabel} onRemove={onHide}>
      <ContextMenu>
        <ContextMenuTrigger render={pill} />
        <ContextMenuContent data-testid={p.menuTestId}>{p.menu}</ContextMenuContent>
      </ContextMenu>
    </SwipeRow>
  );
}

/** A procedure picked at a point, beside its pill: its kind's glyph and its
 *  short title in the approaches' indigo, as the map draws it
 *  (ProceduresGl), whole: pieces wrap whole (RouteToken), so its title is
 *  never cut ("RNAV (GPS) Y RWY 2…", the r7 audit's W-L1); only one wider
 *  than the box itself is, at the box's width. */
export function ProcedureChip({ procedure, onOpen }: { procedure: RouteProcedure; onOpen?: () => void }) {
  const Glyph = PROCEDURE_GLYPH[procedure.kind];
  return (
    // The stock Button, plain, as words in the approaches' indigo: no fill,
    // 28 tall as the pills are, a finger's 44 by its pseudo-element.
    <Button
      variant="ghost"
      size="xs"
      onClick={onOpen}
      data-testid="route-procedure"
      aria-label={`${procedure.spoken}: the route's procedures`}
      className={cn(
        "relative h-7 max-w-full gap-1 rounded-full px-1 font-semibold text-procedure hit-x-0.5 hit-y-2 hover:text-procedure native:text-procedure",
        TEXT.note,
      )}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{procedure.label}</span>
    </Button>
  );
}
