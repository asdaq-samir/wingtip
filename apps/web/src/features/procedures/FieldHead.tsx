import type { ReactNode } from "react";
import { ChevronRight, Fuel, Wind } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { CollapsibleTrigger } from "../../components/ui/collapsible";
import type { ProcedureAirport } from "../plan";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import CardIdent from "./CardIdent";
import { CardMark } from "./routeCard";
import { FuelGauge } from "./FuelGauge";
import type { pointEnd } from "./pointEnd";
import type { ProceduresRouteModel } from "./useProceduresRoute";

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
  vm: ProceduresRouteModel;
  a: ProcedureAirport;
  mark: ReactNode;
  end: ReturnType<typeof pointEnd>;
  tank: ReturnType<ProceduresRouteModel["tanks"]["get"]>;
  wind: string | null;
  reported: ReturnType<ProceduresRouteModel["reportedOf"]>;
}) {
  const { asCards, edit, pointIndex, isFuelStop } = vm;
  return (
    <>
      {/* The airport's lines: a tap anywhere on them -- its symbol, its ident, its fuel, its wind, its time -- opens it,
      at the owner's ask ("it should expand when tapped anywhere on the airport information next to the symbol or
      the symbol itself"): the arrow by the symbol is the button, its area stretched over the lines (before:inset-0);
      the menu and a time to pick lie over it, their own. */}
      <div className="relative flex gap-2.5">
        {/* A fuel stop's pump on top of its symbol, at the owner's ask
                  ("instead of fuel symbol next to airport id, can we put it
                  on top of the airport symbol?"). */}
        {/* The symbol is the field's menu, over the lines' tap that
                  opens them (z-10), at the owner's ask ("Use the airport
                  icon as the more button"). */}
        {/* Centred on the two lines, at the owner's ask ("Center it
                  on the two lines"): the column as tall as they are. */}
        <div className="relative z-10 flex w-7 shrink-0 items-center justify-center">
          {((face) => (asCards ? <CardMark>{face}</CardMark> : face))(
            end.menu(
              <span className="relative">
                {mark}
                {a.role === "Stop" && isFuelStop(a.ident) && (
                  <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-caution text-white ring-2 ring-background">
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
            {/* The disclosure, iOS's small chevron by the symbol, the stock Button inline, not an icon button
            (data-disclosure): the Collapsible's trigger, the arrow turned by its open state. A card's without its
            arrow, at the owner's ask (2026-11-05: "Now that it's a card, we don't need the expanding arrow next to
            airport", then "It should still become a smaller card with a tap"): its tap over the lines alone. */}
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
                  // Its area over the lines a ::before: on a touch screen index.css gives every button's
                  // ::after its 44 points, which overrode an ::after stretched here, and on the owner's phone
                  // only the arrow opened the field ("make the whole line tapable for unfolding"). Static,
                  // where index.css positions every button on a touch screen: its areas reach out to the
                  // lines' box, not its own; and twelve over it, into the room above the field, where the
                  // arrow's 44 points, round its line, reach (the iOS audit's P1).
                  className={cn(
                    "group static grid shrink-0 place-items-center text-tint outline-none before:absolute before:inset-x-0 before:-top-3 before:bottom-0 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
                    asCards ? "-ml-1.5 size-0" : "-ml-0.5 size-4",
                  )}
                />
              }
            >
              {!asCards && <ChevronRight className="size-4 transition-transform group-data-panel-open:rotate-90" aria-hidden />}
            </CollapsibleTrigger>
            {/* The size the list's names were ("the font size is bigger
                      than it used to be for airport id"). */}
            {asCards && edit?.onReplace && pointIndex(a.ident, a.role) !== undefined ? (
              <h3 className="min-w-0">
                <CardIdent
                  value={a.ident}
                  label={`${a.ident}, change`}
                  onCommit={(v) => {
                    const at = pointIndex(a.ident, a.role);
                    if (at !== undefined && !sameField(v, a.ident)) edit.onReplace!(at, v);
                  }}
                />
              </h3>
            ) : (
              <h3 className={cn("truncate font-semibold", TEXT.row)}>{a.ident}</h3>
            )}
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
          <p
            className={cn(
              "col-start-1 row-start-2 flex min-w-0 items-center gap-1 tabular-nums",
              end.direct ? "font-semibold text-tint" : "text-muted-foreground",
              TEXT.note,
            )}
            data-testid="field-wind"
          >
            {end.direct
              ? "Direct to"
              : wind && (
                  <>
                    <Wind className="size-3.5 shrink-0" aria-hidden />
                    <span aria-hidden="true">{wind}</span>
                    <span className="sr-only">{`Wind ${reported === "calm" ? "calm" : reported ? reported.spoken : ""}`}</span>
                  </>
                )}
          </p>
          <div className="col-start-2 row-start-2 justify-self-end">{end.elevation}</div>
          {end.grip && <div className="relative z-10 col-start-3 row-span-2 row-start-1 self-center">{end.grip}</div>}
        </div>
      </div>
    </>
  );
}
