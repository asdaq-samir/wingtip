import { ChevronRight, Plus } from "lucide-react";
import { cn } from "cn";
import { airplaneChosen } from "../../../../lib/preferences";
import { flightLevel } from "../../../../lib/format/figures";
import { routeName } from "../../../../lib/identSchema";
import { TEXT } from "../../../../lib/text";
import { tripFigures } from "../../figures";
import type { PlanWorkspaceModel } from "../../hooks/usePlanWorkspace";

/**
 * The flight at the top of the search's own page (the owner's one-search
 * design, 2026-11-09, "Your flight"): the route, then its distance, time
 * en route and fuel to the destination as the figures at the plan's foot
 * work them out (tripFigures, the engine's totals), the cruise altitude
 * and the airplane -- "No airplane" where none is picked, never one
 * assumed. A tap goes to the plan. With no route, the way to start one:
 * the plan's empty box.
 */
export default function FlightSummary({ vm, onOpen }: { vm: PlanWorkspaceModel; onOpen: () => void }) {
  const { planned, routed, s, estimate, depart, aircraft } = vm;
  const hasPoints = !!planned.dep || !!planned.dest || planned.stops.length > 0;
  if (!hasPoints) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-testid="flight-summary-new"
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left text-tint outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-5 shrink-0" aria-hidden="true" />
        <span className={cn("flex-1 font-semibold", TEXT.row)}>Plan a Flight</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  }
  const figures = routed
    ? tripFigures(
        { totals: s.totals, estimate, local: !!s.local, destination: `${planned.dest}`, depart, toDestination: true },
        false,
      ).filter((f) => f.name !== "To")
    : [];
  const parts = [
    ...figures.map((f) => (f.value === "—" ? null : `${f.value}${f.unit ? ` ${f.unit}` : ""}`)),
    s.nav?.altitude_ft != null ? flightLevel(s.nav.altitude_ft) : null,
    airplaneChosen(aircraft) ? aircraft.label : "No airplane",
  ].filter(Boolean);
  const name = routeName(planned.dep, `${planned.dest}`, planned.stops);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="flight-summary"
      aria-label={`Your flight, ${name}: ${figures.map((f) => f.said).join(", ")}. Open the plan.`}
      className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("font-semibold text-muted-foreground uppercase", TEXT.note)}>Your Flight</span>
        <span className={cn("truncate font-semibold", TEXT.title)} data-testid="flight-summary-route">
          {name || "—"}
        </span>
        {parts.length > 0 && <span className={cn("text-foreground/80 tabular-nums", TEXT.detail)}>{parts.join(" · ")}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
