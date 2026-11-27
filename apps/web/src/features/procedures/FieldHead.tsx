import type { ReactNode } from "react";
import { Fuel, Wind } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { CollapsibleTrigger } from "../../components/ui/collapsible";
import type { ProcedureAirport } from "../plan";
import { TEXT } from "../../lib/text";
import { CardMark } from "./routeCard";
import { FuelGauge } from "./FuelGauge";
import type { pointEnd } from "./pointEnd";
import type { ProceduresRouteModel, RouteListSlice } from "./useProceduresRoute";
import { WORDING } from "../../lib/wording/generated/wording";

/** A field's head: its symbol and menu, its ident, fuel, time, wind and
 *  elevation, in the Collapsible's trigger's reach (FieldStep). */
export function FieldHead({
  vm,
  a,
  mark,
  end,
  tank,
  wind,
  reported,
}: {
  vm: RouteListSlice<"isFuelStop" | "onInfo">;
  a: ProcedureAirport;
  mark: ReactNode;
  end: ReturnType<typeof pointEnd>;
  tank: ReturnType<ProceduresRouteModel["tanks"]["get"]>;
  wind: string | null;
  reported: ReturnType<ProceduresRouteModel["reportedOf"]>;
}) {
  const { isFuelStop, onInfo } = vm;
  return (
    <>
      {/* The airport's lines: a tap anywhere on them -- its fuel, its wind, its time -- opens it, at the owner's ask
      ("it should expand when tapped anywhere on the airport information"): the Collapsible's trigger, its area
      stretched over the lines (before:inset-0); the symbol (its menu), the ident (its card) and a time to pick lie
      over it, their own. */}
      <div className="relative flex gap-2.5">
        {/* A fuel stop's pump on top of its symbol, at the owner's ask
                  ("instead of fuel symbol next to airport id, can we put it
                  on top of the airport symbol?"), in the tint: amber means a
                  caution wherever it is drawn (the owner, 2026-11-17: "Yes to
                  all recs"). */}
        {/* The symbol is the field's menu, over the lines' tap that
                  opens them (z-10), at the owner's ask ("Use the airport
                  icon as the more button"). */}
        {/* Centred on the two lines, at the owner's ask ("Center it
                  on the two lines"): the column as tall as they are. */}
        <div className="relative z-10 flex w-7 shrink-0 items-center justify-center">
          {((face) => <CardMark>{face}</CardMark>)(
            end.menu(
              <span className="relative">
                {mark}
                {a.role === "Stop" && isFuelStop(a.ident) && (
                  <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-tint text-primary-foreground ring-2 ring-background">
                    <Fuel className="size-2.5" strokeWidth={2.6} aria-label="fuel stop" role="img" />
                  </span>
                )}
              </span>,
            ),
          )}
        </div>
        {/* Two lines, as a waypoint's row and the list before had them, at the owner's ask ("line up the time with
        airport id and elevation with wind like before"): the ident and the time, then the wind and the elevation. */}
        <div
          className={cn(
            "grid min-w-0 flex-1 items-center gap-x-2",
            end.grip ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]",
          )}
        >
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5">
            {/* The row's one disclosure (the UI audit's C14): a tap anywhere on its lines folds the runways and
            procedures open, the whole line (the owner, 2026-11-05: "make the whole line tapable for unfolding"),
            no chevron of its own beside the symbol, which is the menu. The Collapsible's trigger laid over the lines
            (its own `absolute` wins over index.css's touch positioning), and twelve over them into the room above
            the field (the iOS audit's P1); what has a tap of its own lies over it (z-10). */}
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="inline"
                  type="button"
                  data-testid="field-toggle"
                  data-ident={a.ident}
                  data-disclosure=""
                  aria-label={`${a.ident}: runways and procedures`}
                  className={cn(
                    "absolute inset-x-0 -top-3 bottom-0 rounded-lg outline-none hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                />
              }
            />
            {/* The ident a link in the tint to the airport's card, over the row's fold, as the nav log's names are
            (NavLogList's navlog-field-open; the owner, 2026-11-17: "Can we make the airports/stops tappable as the
            navlog does?"). Its 44 points a pseudo-element; the ident not grown. In the Plan's cards it was a text
            box: an airport is changed from its menu's Change now (pointEnd), by the one search. */}
            {/* Its role over the ident, a caption, so a new pilot can tell
                which card is which end (labels C of the one layout's canvas,
                the owner, 2026-11-17); the section's name says it to a
                screen reader. */}
            <h3 className={cn("flex min-w-0 flex-col font-semibold", TEXT.row)}>
              <span aria-hidden="true" className={cn("text-muted-foreground", TEXT.caption)} data-testid="field-role">
                {a.role}
              </span>
              <Button
                variant="link"
                size="inline"
                data-testid="field-open"
                data-ident={a.ident}
                aria-label={`${a.ident}: open the airport`}
                onClick={(event) => {
                  event.stopPropagation();
                  onInfo(a.ident);
                }}
                className="relative z-10 max-w-full self-start justify-start truncate font-semibold hit-y-[11px]"
              >
                {a.ident}
              </Button>
            </h3>
            {tank && (
              <FuelGauge
                gal={tank.gal}
                usable={tank.usable}
                tone={tank.low ? "low" : a.role === "Stop" && isFuelStop(a.ident) ? "fuel" : undefined}
              />
            )}
          </div>
          <div className="relative z-10 col-start-2 row-start-1 justify-self-end">{end.time}</div>
          {/* The wind grey as the elevation, a figure, not a link (the UI audit's C14); Direct to in the tint. */}
          <WindLine direct={end.direct} wind={wind} reported={reported} className="col-start-1 row-start-2" />
          <div className="col-start-2 row-start-2 justify-self-end">{end.elevation}</div>
          {end.grip && <div className="relative z-10 col-start-3 row-span-2 row-start-1 self-center">{end.grip}</div>}
        </div>
      </div>
    </>
  );
}

/** A field's wind, grey as its elevation, a figure, not a link (the UI
 *  audit's C14), said in full to VoiceOver; Direct to in the tint where the
 *  route flies direct to it. */
export function WindLine({
  direct,
  wind,
  reported,
  className,
}: {
  direct: boolean;
  wind: string | null;
  reported: ReturnType<ProceduresRouteModel["reportedOf"]>;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-1 tabular-nums",
        direct ? "font-semibold text-tint" : "text-muted-foreground",
        TEXT.note,
        className,
      )}
      data-testid="field-wind"
    >
      {direct
        ? WORDING.directTo
        : wind && (
            <>
              <Wind className="size-3.5 shrink-0" aria-hidden />
              <span aria-hidden="true">{wind}</span>
              <span className="sr-only">{`Wind ${reported === "calm" ? "calm" : reported ? reported.spoken : ""}`}</span>
            </>
          )}
    </p>
  );
}
