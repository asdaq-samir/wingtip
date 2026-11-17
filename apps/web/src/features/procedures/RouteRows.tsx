import type { ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { cn } from "cn";
import { ROUTE_LINE } from "./routeListStyle";
import { TEXT } from "../../lib/text";
import type { LegHold } from "../../lib/api/types";
import { holdWords, type Hold } from "../plan";
import { pointName } from "../../lib/identSchema";

// The rows down FPL's route list (ProceduresRoute, each a row of its
// RouteGrid) other than a field's block (FieldStep): a point flown over
// and a hold.

/**
 * A hold the pilot put at a point (HoldSheet), its own row after it: a
 * racetrack on the route's line, what it is ("Right turns · 270° inbound
 * · 1 min legs · 2 turns"), the entry the planner worked out from the
 * course flown to it (AIM 5-3-8) and the time it adds; a tap changes it.
 */
export function HoldRow({ hold, flown, last, onOpen }: { hold: Hold; flown: LegHold | null; last: boolean; onOpen: () => void }) {
  return (
    <div className="relative flex gap-2.5" data-testid="route-hold">
      {!last && <span aria-hidden="true" className="absolute top-0 bottom-0 left-[calc(0.875rem-1px)] w-0.5" style={ROUTE_LINE} />}
      <div className="relative flex w-7 shrink-0 justify-center pt-1.5" aria-hidden="true">
        <svg viewBox="0 0 28 16" className="h-4 w-7 rounded-full bg-background">
          <rect x="2" y="2" width="24" height="12" rx="6" fill="none" className="stroke-course" strokeWidth="2.5" strokeDasharray="4 3" />
        </svg>
      </div>
      <Button
        variant="ghost"
        size="inline"
        type="button"
        onClick={onOpen}
        aria-label={`Hold at ${pointName(hold.fix)}: ${holdWords(hold)}${flown ? `, ${flown.entry} entry, ${Math.round(flown.minutes)} minutes more` : ""}: change`}
        className={cn(
          "justify-start text-inherit",
          "mb-4 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-tint/8 px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("font-semibold", TEXT.row)}>Hold</span>
          <span className={cn("text-muted-foreground", TEXT.note)}>
            {holdWords(hold)}
            {flown ? ` · ${flown.entry} entry` : ""}
          </span>
        </span>
        {flown && <span className={cn("shrink-0 font-semibold tabular-nums", TEXT.detail)}>+{Math.round(flown.minutes)} min</span>}
        <ChevronRight className="size-5 shrink-0 text-tint" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * One step down the line the flight takes: its mark on the line, as the
 * nav log draws it, its name and the time it is reached, and under them
 * what is flown there (a field's). The line runs on to the next step.
 */
export function Step({
  mark,
  title,
  sub,
  figures,
  menu,
  grip,
  last,
  field = false,
  testId,
  icon,
  children,
}: {
  /** Its menu, behind its mark (PointMenu's `face`). */
  mark: ReactNode;
  /** After its name: the fuel in the tanks there (FuelGauge). */
  icon?: ReactNode;
  /** Its name, said to a screen reader and shown in its head, and the line
   *  under it: what it is, and how far along. */
  title: string;
  sub?: ReactNode;
  /** Its time over its altitude (PointFigures). */
  figures: ReactNode;
  menu?: (face: ReactNode) => ReactNode;
  /** Its grip, where the list changes the route (RouteGrid's PointGrip). */
  grip?: ReactNode;
  last: boolean;
  field?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const Name = field ? "h3" : "span";
  return (
    <div className="relative flex gap-2.5" data-testid={testId}>
      {!last && <span aria-hidden="true" className="absolute top-3 bottom-0 left-[calc(0.875rem-1px)] w-0.5" style={ROUTE_LINE} />}
      <div className="relative flex w-7 shrink-0 justify-center pt-0.5">{menu ? menu(mark) : mark}</div>
      <section aria-label={title} className={cn("min-w-0 flex-1 space-y-3", field ? "pb-5" : "pb-4")}>
        <div className="relative flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              <Name className={cn("truncate", field ? "font-semibold" : "font-normal", TEXT.row)}>{title}</Name>
              {icon}
            </span>
            {sub && <span className={cn("truncate text-muted-foreground", TEXT.note)}>{sub}</span>}
          </div>
          {figures}
          {grip}
        </div>
        {children}
      </section>
    </div>
  );
}

/** A stop before the destination, as Maps' Add Stop is, the last row of
 *  FPL's timeline (TimelineRoute): the stock Button, a whole row's width
 *  and a 44-point row (the audit's WEB-18), its mark Apple Maps' -- a
 *  filled circle in the tint with a white + -- and its words in the tint,
 *  after the timeline's inset hairline. */
export function AddStopRow({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      data-testid="timeline-add-stop"
      className={cn("h-11 w-full justify-start gap-3 px-0 text-tint hover:bg-transparent", TEXT.row)}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-white">
        <Plus className="size-4" strokeWidth={2.6} aria-hidden />
      </span>
      <span className="flex h-full flex-1 items-center border-t border-border">Add a Stop</span>
    </Button>
  );
}
