import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { TEXT } from "../../lib/text";
import type { NavLogRow, ProcedureAirport } from "../plan";
import { FuelGauge } from "./FuelGauge";
import { FuelSet } from "./FuelSet";
import { WindLine } from "./FieldHead";
import { kindMenu, windWords } from "./fieldParts";
import { PartTray } from "./RunwayTray";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import { askHold, type pointEnd } from "./pointEnd";
import { HoldChip } from "./HoldChip";
import { ProcedurePill, TimelineProcedureRows } from "./TimelineProcedureRows";
import { LoadedApproach, MissedApproach } from "./TimelineApproachParts";
import { lineModel, type TimelinePoint } from "./lineModel";
import { LineIdent, LineNotes } from "./TimelineMark";
import type { ProceduresRouteModel } from "./useProceduresRoute";

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
  trailing,
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
  /** At the line's end, over its tap: half a route's box's toggle, inside
   *  the line's own right inset (TIMELINE_END), as every row's last
   *  control is (TimelineAction). */
  trailing?: ReactNode;
}) {
  const { opens, refused, tank, fuelSet, reported, parts, before, after, missedOn } = lineModel(vm, point, row, field);
  // Its procedures folded into pills on the line (ProcedurePill), each
  // unfolded on the line by a tap on its pill (the owner, 2026-11-23,
  // "Pill on its field"): an arrival's and an approach's rows before the
  // field's line, a departure's after it, as when they were always out.
  const [unfolded, setUnfolded] = useState<(typeof before)[number][]>([]);
  const toggle = (k: (typeof before)[number]) => setUnfolded((was) => (was.includes(k) ? was.filter((x) => x !== k) : [...was, k]));
  const beforeOut = before.filter((k) => unfolded.includes(k));
  const afterOut = after.filter((k) => unfolded.includes(k));
  const pills = field ? [...before, ...after] : [];
  // The line runs on past the field to the next, or into a departure's
  // fixes unfolded under it.
  const onPast = !last || afterOut.length > 0;
  // Each part's tray, a stop's takeoff a region of its own as the list
  // read in flight names it ("KMSN · Depart"); a kind not picked as
  // "+ APCH"; the destination's hold last, once it has one.
  const chips = parts.map(({ part, add, hold }, i) => {
    const tray = (
      <PartTray
        key={part.role}
        vm={vm}
        a={field!}
        part={part}
        trailing={[
          ...add.map((k) => kindMenu(vm, field!, k, "add")),
          ...(hold
            ? [<HoldChip key="hold" ident={point.ident} hold={vm.holdOn(point.ident)} onOpen={() => askHold(vm, point.ident, row)} />]
            : []),
        ]}
      />
    );
    return i === 0 ? (
      tray
    ) : (
      // The chips row's width and no wider, as the first part's field-part
      // is: a flex item of its own, a stop's Depart line took its runways'
      // whole width, KMSN's six ran 126 past a phone's 390 and its 32 was
      // out of reach under the summary's clip (stops.spec).
      <section key={part.role} aria-label={`${point.ident} · ${part.role}`} className="w-full min-w-0">
        {tray}
      </section>
    );
  });
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
        {(onPast || missedOn) && <span aria-hidden="true" className={TIMELINE_THREAD} />}
      </span>
      <div className={cn("min-w-0 flex-1", TIMELINE_END, (!first || beforeOut.length > 0) && "border-t border-border")}>
        {/* Wrapping where the ident, its fuel and its time do not fit on one
            line, the time going under them at the right: at the owner's
            19.65 px on a 375-point phone KDEN's ident was cut to "KD…" by
            "−26 gal" and "21:48 MST" (the HIG review, 2026-11-21). */}
        <div className="relative flex min-h-11 min-w-0 flex-wrap items-center gap-x-2 py-0.5">
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
                  // (the grouped box's audit, 2026-11-20), and under a mouse's
                  // press, lighter as it points, as every other row answers a
                  // pointer (the design review of 2026-11-23, M5).
                  className="absolute inset-0 rounded-lg outline-none hover:bg-muted/50 aria-expanded:bg-transparent dark:hover:bg-muted/50 active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                />
              }
            />
          )}
          <div className="flex min-w-0 shrink flex-col">
            <LineIdent point={point} change={end.change} onInfo={() => vm.onInfo(point.ident)} fuelSet={!!fuelSet} />
          </div>
          {/* The fuel right after the ident, the time at the right (the
              owner, 2026-11-17: "Fuel should go right after airport"; kept
              as the gauge, 2026-11-20: "I like the previous fuel tanks"). */}
          {/* Tapped to set the fuel leaving a field (FuelSet), where the
              list edits the route: the departure's on board, a stop's after
              fuelling; the destination's and a waypoint's read only. */}
          {fuelSet && tank ? (
            <FuelSet
              tank={tank}
              ident={fuelSet.ident}
              stop={fuelSet.stop}
              tone={tank.low ? "low" : undefined}
              onSet={(gallons) => vm.onTanks?.(fuelSet.ident, gallons)}
            />
          ) : (
            // As far from the ident as a gauge that is a control (FuelSet's
            // 18), so every line's gauge stands in one place.
            tank && (
              <span className="ml-2.5 flex shrink-0">
                <FuelGauge gal={tank.gal} usable={tank.usable} tone={tank.low ? "low" : undefined} />
              </span>
            )
          )}
          <span className="flex-1" />
          <span className={cn("relative z-10 ml-auto shrink-0 text-muted-foreground tabular-nums", TEXT.row)} data-testid="timeline-time">
            {point.time}
          </span>
          {/* No chevron at its end (the owner, 2026-11-19: "Also remove
              the chevrons"): the line itself is the tap that opens it. */}
          {end.grip}
          {trailing && <span className="relative z-10 flex h-11 shrink-0 items-center">{trailing}</span>}
        </div>
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2" data-testid="procedure-pills">
            {pills.map((k) => (
              <ProcedurePill key={k} vm={vm} field={field!} kind={k} open={unfolded.includes(k)} onToggle={() => toggle(k)} />
            ))}
          </div>
        )}
        <LineNotes point={point} refused={refused} />
        {opens && (
          <CollapsibleContent
            // Base UI's own panel animation: the lines under it move down as
            // it opens rather than jumping (none with Reduce Motion, index.css).
            // Its clip stood out by the chips' reach on three sides (a
            // margin given back as padding), so their 44-point areas and
            // focus rings are not cut while it is open (the r5-ui audit's L4).
            className="-mx-2 -mt-2 h-(--collapsible-panel-height) space-y-2 overflow-hidden px-2 pt-2 pb-2 transition-[height] duration-(--motion-fade) ease-(--motion-sheet-ease) data-ending-style:h-0 data-starting-style:h-0"
            data-testid="timeline-details"
          >
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
    <div role={parts[0] ? "region" : undefined} aria-label={parts[0] ? `${point.ident} · ${parts[0].part.role}` : undefined}>
      {beforeOut.map((k) => (
        <TimelineProcedureRows key={k} vm={vm} field={field!} kind={k} />
      ))}
      {line}
      {field && !point.problem && <MissedApproach vm={vm} field={field} stop={!onPast} />}
      {field && !point.problem && <LoadedApproach vm={vm} field={field} through={onPast} />}
      {afterOut.map((k, i) => (
        <TimelineProcedureRows key={k} vm={vm} field={field!} kind={k} stop={last && i === afterOut.length - 1} />
      ))}
    </div>
  );
}
