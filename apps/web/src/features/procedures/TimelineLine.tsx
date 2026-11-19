import type { ReactNode } from "react";
import { Ellipsis, Fuel, Navigation, Plane, Triangle, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { colourOf } from "../../lib/map/marks/flightCategory";
import { TEXT } from "../../lib/text";
import { pointName } from "../../lib/identSchema";
import type { NavLogRow, ProcedureAirport } from "../plan";
import { FuelGauge } from "./FuelGauge";
import { WindLine } from "./FieldHead";
import { fieldParts, kindMenu, kindPicked, windWords } from "./fieldParts";
import { PartTray } from "./RunwayTray";
import { TIMELINE_THREAD } from "./TimelineRows";
import { askHold, type pointEnd } from "./pointEnd";
import { HoldChip } from "./HoldChip";
import type { ProceduresRouteModel } from "./useProceduresRoute";

/** One point of FPL's timeline as the plan gives it (RouteTimeline). */
export interface TimelinePoint {
  ident: string;
  role: ProcedureAirport["role"];
  /** Its place among the route's typed points (routePoints). */
  index: number;
  /** How many times the route is at it before, and which visit this is
   *  where it is at it more than once (visitAt): its nav log row's and
   *  its own altitude's. */
  seen: number;
  visit: number | undefined;
  /** Its time: the departure's leave time, the others' arrival. */
  time: ReactNode;
  /** Its flight category from its latest METAR; none with no report. */
  category: string | null;
  /** Why it cannot be flown to, in red under it: a point the planner does
   *  not know, a field NASR lists as closed (decision 0043), or a field
   *  whose card could not be had to say. */
  problem: string | null;
  /** A field whose card has not said yet whether it is open: its line
   *  does not open to its runways and procedures till it has (0043). */
  checking: boolean;
  /** A fuel stop the plan or the pilot picked. */
  fuelStop: boolean;
  /** An airport, not My Location or a waypoint. */
  field: boolean;
}

/**
 * A point's mark, as Apple Maps' Directions draw theirs (the owner,
 * 2026-11-17: "give it similar look to Apple Maps for single rows"): a
 * filled 32-point circle with a white glyph -- My Location the tint with
 * the location arrow; an airport its flight category's colour (the map's,
 * grey with no report) with an airplane, a fuel stop's the pump; a
 * waypoint a grey triangle; one that cannot be flown to the red with ✕.
 * Where it is the point's menu (`more`, while the route is edited) it says
 * "•••" alone, the tint's ellipsis on the tint's wash, as iOS's More button
 * (the owner, 2026-11-17: "Make the left buttons say ... only"); a fuel
 * stop still told to a reader, the category in its ident's label.
 */
export function TimelineMark({ point, position, more = false }: { point: TimelinePoint; position: boolean; more?: boolean }) {
  if (more)
    return (
      <span
        className="grid size-8 place-items-center rounded-full bg-tint/12 text-tint"
        data-testid={point.fuelStop ? "timeline-fuel" : undefined}
      >
        <Ellipsis className="size-5" strokeWidth={2.4} aria-hidden />
        {point.fuelStop && <span role="img" aria-label="fuel stop" />}
      </span>
    );
  const Glyph = point.problem ? X : position ? Navigation : !point.field ? Triangle : point.fuelStop ? Fuel : Plane;
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-full text-white",
        point.problem ? "bg-destructive" : position ? "bg-tint" : !point.field && "bg-muted-foreground",
      )}
      // The category's colour from the map's own scale (flightCategory).
      style={point.field && !point.problem && !position ? { backgroundColor: colourOf(point.category) } : undefined}
      data-testid={point.fuelStop ? "timeline-fuel" : undefined}
    >
      <Glyph className="size-4" strokeWidth={2.4} aria-label={point.fuelStop ? "fuel stop" : undefined} aria-hidden={!point.fuelStop} />
    </span>
  );
}

/**
 * One line of FPL's timeline (TimelineRoute): its mark (its menu), the
 * route's magenta in Apple's short rounded dashes down to the next, and
 * after a hairline from the text on -- iOS's inset grouped list -- its ident
 * (a link to its card), the fuel in the tanks there, its time and its grip.
 * A field's line is a stock Collapsible: a tap on it off the ident opens
 * two rows under it, its wind at the left and its elevation at the right,
 * then its runway and procedure chips (the owner, 2026-11-17: "exactly
 * three rows, always"); My Location and a waypoint have none. A field it
 * cannot land at says why in red in the wind's place, no chips.
 */
export function TimelineLine({
  vm,
  point,
  row,
  field,
  end,
  mark,
  first,
  last,
  open,
  onOpen,
}: {
  vm: ProceduresRouteModel;
  point: TimelinePoint;
  /** Its row of the nav log, once the plan is in. */
  row: NavLogRow | undefined;
  /** The airport's procedures' field, where it is one of the route's. */
  field: ProcedureAirport | undefined;
  end: ReturnType<typeof pointEnd>;
  mark: ReactNode;
  first: boolean;
  last: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const { onInfo, tanks, reportedOf } = vm;
  // Never opened to land at before the field is known open (decision 0043).
  const opens = !!field && !!vm.edit && !point.problem && !point.checking;
  // A move of this point refused, why under it (useRouteListEdit).
  const refused = vm.edit?.refusal?.index === point.index ? vm.edit.refusal.note : null;
  const tank = point.role === "Departure" ? tanks.get("departure") : row ? tanks.get(row.key) : undefined;
  const reported = reportedOf(point.ident);
  const parts = field ? fieldParts(vm, field, row) : [];
  // Each part's tray, a stop's takeoff a region of its own as the list
  // read in flight names it ("KMSN · Depart"); a procedure picked as its
  // short name's chip ("ILS 26 ⌄"), a kind not picked as "+ APCH"; the
  // destination's hold last ("+ HOLD").
  const chips = parts.map((part, i) => {
    const tray = (
      <PartTray
        key={part.role}
        vm={vm}
        a={field!}
        part={part}
        trailing={[
          ...part.kinds.map((k) => kindMenu(vm, field!, k, kindPicked(vm, field!, k) ? "chip" : "add")),
          // The destination's hold after its procedures (HoldChip).
          ...(point.role === "Destination" && part.role === "Arrive"
            ? [<HoldChip key="hold" ident={point.ident} hold={vm.holdOn(point.ident)} onOpen={() => askHold(vm, point.ident, row)} />]
            : []),
        ]}
      />
    );
    return i === 0 ? (
      tray
    ) : (
      <section key={part.role} aria-label={`${point.ident} · ${part.role}`}>
        {tray}
      </section>
    );
  });
  return (
    <Collapsible
      open={opens && open}
      onOpenChange={onOpen}
      render={
        <div
          className="relative flex gap-3"
          // A field's line a region, named as the list read in flight names
          // its step ("KDLH · Arrive"), so VoiceOver goes from field to field.
          role={parts[0] ? "region" : undefined}
          aria-label={parts[0] ? `${point.ident} · ${parts[0].role}` : undefined}
          data-testid="timeline-line"
          data-ident={point.ident}
          data-open={opens && open ? "" : undefined}
        />
      }
    >
      {/* The mark, and the route's magenta in short rounded dashes from
          under it into the next line, centred under the marks. */}
      <span className="relative flex w-8 shrink-0 justify-center">
        <span className="relative z-10 flex h-11 items-center">{mark}</span>
        {!last && <span aria-hidden="true" className={TIMELINE_THREAD} />}
      </span>
      <div className={cn("min-w-0 flex-1 pr-1", !first && "border-t border-border")}>
        <div className="relative flex h-11 min-w-0 items-center gap-2">
          {opens && (
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="inline"
                  type="button"
                  data-testid="timeline-toggle"
                  aria-label={`${point.ident}: runways and procedures`}
                  className="absolute inset-0 rounded-lg outline-none hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            />
          )}
          {point.field && !point.problem ? (
            <h3 className="relative z-10 flex shrink-0">
              <Button
                variant="plain"
                size="inline"
                onClick={() => onInfo(point.ident)}
                aria-label={`${point.ident}${point.category ? `, ${point.category}` : ""}: open the airport`}
                data-testid="timeline-ident"
                className={cn(
                  "relative shrink-0 font-semibold after:absolute after:-inset-y-3 after:-inset-x-1 after:content-['']",
                  TEXT.row,
                )}
              >
                {point.ident}
              </Button>
            </h3>
          ) : (
            <span
              className={cn("min-w-0 truncate font-semibold", point.problem && "text-destructive", TEXT.row)}
              data-testid="timeline-ident"
            >
              {pointName(point.ident)}
            </span>
          )}
          {/* The fuel right after the ident, the time at the right (the
              owner, 2026-11-17: "Fuel should go right after airport"). */}
          {tank && <FuelGauge gal={tank.gal} usable={tank.usable} tone={tank.low ? "low" : undefined} />}
          <span className="flex-1" />
          <span className={cn("relative z-10 shrink-0 text-muted-foreground tabular-nums", TEXT.row)} data-testid="timeline-time">
            {point.time}
          </span>
          {end.grip && <span className="relative z-10">{end.grip}</span>}
        </div>
        {/* A field it cannot land at, or a point the planner does not
            know: why, in red, always in sight (decision 0043). */}
        {point.problem && (
          <p className={cn("pb-2 text-destructive", TEXT.note)} data-testid="timeline-problem">
            {point.problem}
          </p>
        )}
        {/* A move of it the route cannot take, said where it was tried
            (lib/problems: in place, no toast); polite, as a screen
            reader's drop is said. */}
        <p role="status" className={cn("text-destructive empty:hidden", refused && "pb-2", TEXT.note)} data-testid="timeline-refusal">
          {refused}
        </p>
        {opens && (
          <CollapsibleContent className="space-y-2 pb-2" data-testid="timeline-details">
            {/* The elevation under the time, clear of the grip's column
                (its 32 points and the gap; the owner, 2026-11-17: "the
                elevation should be under the time"). */}
            <div className={cn("flex min-h-6 items-center justify-between gap-2", end.grip && "pr-10")}>
              <WindLine direct={end.direct} wind={windWords(reported)} reported={reported} />
              {end.elevation}
            </div>
            <div className="flex flex-wrap items-center gap-2" data-testid="timeline-chips">
              {chips}
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
