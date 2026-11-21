import type { ReactNode } from "react";
import { Ellipsis, Fuel, Navigation, Triangle, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { colourOf } from "../../lib/map/marks/flightCategory";
import { TEXT } from "../../lib/text";
import { pointName } from "../../lib/identSchema";
import type { NavLogRow, ProcedureAirport } from "../plan";
import { FuelGauge } from "./FuelGauge";
import { FuelSet } from "./FuelSet";
import { WindLine } from "./FieldHead";
import { fieldParts, kindMenu, kindPicked, windWords, type FieldPart } from "./fieldParts";
import { PartTray } from "./RunwayTray";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import { askHold, type pointEnd } from "./pointEnd";
import { HoldChip } from "./HoldChip";
import { TimelineProcedureRows } from "./TimelineProcedureRows";
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
  /** Where it, or the leg to it, lies outside the United States: the
   *  engine's warning that its figures are by US rules (decision 0053). */
  caution: string | null;
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
 * An airport's glyph is "•••", not an airplane: where the list edits the
 * route the mark is the point's menu (pointEnd's `menu`), and its dots say
 * so (the owner, 2026-11-20: "Stops should have ... buttons to show that
 * there are more options", "I meant replace the plane icon with three
 * dots"); its colour still the field's flight category. A hold on the
 * line stays the row's lift to move it (RouteGrid).
 */
export function TimelineMark({ point, position }: { point: TimelinePoint; position: boolean }) {
  const Glyph = point.problem ? X : position ? Navigation : !point.field ? Triangle : point.fuelStop ? Fuel : Ellipsis;
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
 * route's magenta, one solid line, down to the next, and
 * after a hairline from the text on -- iOS's inset grouped list -- its ident
 * (a tap changes it where the list edits the route, else opens its card),
 * the fuel in the tanks there, and its time.
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
  // read in flight names it ("KMSN · Depart"); a kind not picked as
  // "+ APCH"; the destination's hold last, once it has one. A kind picked
  // is no chip: its fixes are points on the route's line (TimelineProcedureRows).
  const onLine = (kinds: FieldPart["kinds"]) => (field && !point.problem ? kinds.filter((k) => kindPicked(vm, field, k)) : []);
  const chips = parts.map((part, i) => {
    const tray = (
      <PartTray
        key={part.role}
        vm={vm}
        a={field!}
        part={part}
        trailing={[
          ...part.kinds.filter((k) => !kindPicked(vm, field!, k)).map((k) => kindMenu(vm, field!, k, "add")),
          // The destination's hold after its procedures (HoldChip), once
          // there is one: no "+ HOLD" to add one (the owner, 2026-11-19: "No
          // need for +HOLD"); its menu's Hold adds it.
          ...(point.role === "Destination" && part.role === "Arrive" && vm.holdOn(point.ident)
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
  // A procedure picked, its fixes on the route's line in flight order, at
  // the owner's pick (option D, 2026-11-21): an arrival's and an
  // approach's before the field's line, a departure's after it.
  const before = onLine(parts.find((p) => p.role === "Arrive")?.kinds ?? []);
  const after = onLine(parts.find((p) => p.role === "Depart")?.kinds ?? []);
  const line = (
    <Collapsible
      open={opens && open}
      onOpenChange={onOpen}
      render={
        <div
          // The marks' column 16 from the words (gap-4): at 12 a short
          // name's 44-point square, centred on it, reached over the mark's
          // area ("C81: open the airport" 25 wide), where at 16 the two
          // meet (TIMELINE_GAP, the rows' too).
          className={cn("relative flex", TIMELINE_GAP)}
          data-testid="timeline-line"
          data-ident={point.ident}
          data-open={opens && open ? "" : undefined}
        />
      }
    >
      {/* The mark, and the route's magenta, one solid line, from
          under it into the next line, centred under the marks. */}
      <span className="relative flex w-8 shrink-0 justify-center">
        <span className="relative z-10 flex h-11 items-center">{mark}</span>
        {(!last || after.length > 0) && <span aria-hidden="true" className={TIMELINE_THREAD} />}
      </span>
      <div className={cn("min-w-0 flex-1", TIMELINE_END, (!first || before.length > 0) && "border-t border-border")}>
        <div className="relative flex min-h-11 min-w-0 items-center gap-2 py-0.5">
          {opens && (
            <CollapsibleTrigger
              render={
                <Button
                  variant="ghost"
                  size="inline"
                  type="button"
                  data-testid="timeline-toggle"
                  aria-label={`${point.ident}: runways and procedures`}
                  // Greyed under a finger as iOS's rows are, under the line's words
                  // (the grouped box's audit, 2026-11-20).
                  className="absolute inset-0 rounded-lg outline-none hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent pointer-coarse:active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            />
          )}
          {/* The ident in the regular weight (the owner, 2026-11-20: "Stops
              font can be non-bold"). */}
          <div className="flex min-w-0 shrink flex-col">
            {end.change || (point.field && !point.problem) ? (
              <h3 className="relative z-10 flex min-w-0 shrink">
                {/* A tap on the name changes the point where the list edits
                    the route (pointEnd's `change`, the one search with its
                    suggestions); elsewhere it opens the airport's card. */}
                <Button
                  variant="plain"
                  size="inline"
                  onClick={end.change ?? (() => onInfo(point.ident))}
                  aria-label={
                    end.change
                      ? `${pointName(point.ident)}${point.category ? `, ${point.category}` : ""}: change it`
                      : `${point.ident}${point.category ? `, ${point.category}` : ""}: open the airport`
                  }
                  data-testid="timeline-ident"
                  // The name cut short in a span of its own, not the
                  // button: a button that clips (truncate's overflow) cut
                  // its own 44-point area to its 22-point line (the iOS
                  // audit's P1, "C81: change it" 25×22). Its area starts
                  // 10 before the name, where the mark's ends (6 past the
                  // marks' column, PointMenu's `bare`, in the line's 16),
                  // and runs right to 44 wide at the least, over the fuel's
                  // gauge after a short name, which is no control.
                  className={cn(
                    "relative min-w-0 font-normal after:absolute after:-inset-y-3 after:-left-2.5 after:w-[max(54px,calc(100%+14px))] after:content-['']",
                    point.problem && "text-destructive",
                    TEXT.row,
                  )}
                >
                  <span className="min-w-0 truncate">{pointName(point.ident)}</span>
                </Button>
              </h3>
            ) : (
              <span
                className={cn("min-w-0 truncate font-normal", point.problem && "text-destructive", TEXT.row)}
                data-testid="timeline-ident"
              >
                {pointName(point.ident)}
              </span>
            )}
          </div>
          {/* The fuel right after the ident, the time at the right (the
              owner, 2026-11-17: "Fuel should go right after airport"; kept
              as the gauge, 2026-11-20: "I like the previous fuel tanks"). */}
          {/* Tapped to set the fuel leaving a field (FuelSet), where the
              list edits the route: the departure's on board, a stop's after
              fuelling; the destination's and a waypoint's read only. */}
          {tank && vm.onTanks && row && point.field && !point.problem && (row.kind === "departure" || row.kind === "stop") ? (
            <FuelSet
              tank={tank}
              ident={row.airport.ident}
              stop={row.kind === "stop"}
              tone={tank.low ? "low" : undefined}
              onSet={(gallons) => vm.onTanks?.(row.airport.ident, gallons)}
            />
          ) : (
            tank && <FuelGauge gal={tank.gal} usable={tank.usable} tone={tank.low ? "low" : undefined} />
          )}
          <span className="flex-1" />
          <span className={cn("relative z-10 shrink-0 text-muted-foreground tabular-nums", TEXT.row)} data-testid="timeline-time">
            {point.time}
          </span>
          {/* No chevron at its end (the owner, 2026-11-19: "Also remove
              the chevrons"): the line itself is the tap that opens it. */}
          {end.grip}
        </div>
        {/* A field it cannot land at, or a point the planner does not
            know: why, in red, always in sight (decision 0043). */}
        {point.problem && (
          <p className={cn("pb-2 text-destructive", TEXT.note)} data-testid="timeline-problem">
            {point.problem}
          </p>
        )}
        {/* Outside the United States: said under it, never refused. */}
        {point.caution && !point.problem && (
          <p className={cn("pb-2 text-caution-ink", TEXT.note)} data-testid="timeline-caution">
            {point.caution}
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
            {/* The elevation under the time (the owner, 2026-11-17: "the
                elevation should be under the time"). */}
            <div className="flex min-h-6 items-center justify-between gap-2">
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
  // A field's line, with its procedures' rows, a region named as the list
  // read in flight names its step ("KDLH · Arrive"), so VoiceOver goes
  // from field to field.
  return (
    <div role={parts[0] ? "region" : undefined} aria-label={parts[0] ? `${point.ident} · ${parts[0].role}` : undefined}>
      {before.map((k) => (
        <TimelineProcedureRows key={k} vm={vm} field={field!} kind={k} />
      ))}
      {line}
      {after.map((k, i) => (
        <TimelineProcedureRows key={k} vm={vm} field={field!} kind={k} stop={last && i === after.length - 1} />
      ))}
    </div>
  );
}
