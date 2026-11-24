import type { ReactNode } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleTrigger } from "../../components/ui/collapsible";
import { approachRunway } from "../../lib/procedures";
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
import { TimelineProcedureRows } from "./TimelineProcedureRows";
import { MissedApproach } from "./TimelineApproachParts";
import { approachAt } from "./approachState";
import { lineModel, type TimelinePoint } from "./lineModel";
import { LineIdent, LineNotes } from "./TimelineMark";
import { FoldSection, PhaseCards } from "./onTheLine";
import type { ProceduresRouteModel } from "./useProceduresRoute";

/** No procedure's rows out: one list, not a new one each render. */
const NONE: readonly never[] = [];

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
  const { opens, refused, tank, fuelSet, reported, parts, before, after } = lineModel(vm, point, row, field);
  // The field the heading of its group (the owner, 2026-11-24: "that
  // airport should be the heading and than it should have the folding
  // runways and folding procedures inside, which should connect with
  // magenta line when unfolded"): under its line, while the line is open,
  // its runways, then its arrival, its approach, the approach's missed
  // approach and its departure, each a section that folds (FoldSection),
  // the route's magenta running down through them. Out of sight with the
  // line shut (the owner, 2026-11-23: "Keep the pill hidden like runway"),
  // so at half a field's line is its ident alone. A line that does not
  // open, in flight or a dry run where the list is read, not edited, shows
  // its procedures, a suspended missed approach's Unsuspend at a glance.
  const out = opens ? open : true;
  const beforeOut = out ? before : NONE;
  const afterOut = out ? after : NONE;
  const approach = field && !point.problem ? approachAt(vm, field) : undefined;
  const missedHere = out && !!approach && !approach.loaded && (approach.missedFixes?.length ?? 0) > 0;
  // A straight-in approach picked lands on its own runway, so the landing's
  // runway is not offered beside it; a circling-only one ("VOR-A") lands on
  // any, and keeps it (the owner, 2026-11-24: "Changing runway would
  // conflict with the selected approach. So runway section can hide unless
  // a circling approach?"). Its pull-downs and hold stay, a part with none
  // of them goes.
  const straightIn = !!approach && approachRunway(approach.name ?? "") !== null;
  const shownParts = parts.filter((p) => !(p.part.role === "Arrive" && straightIn && p.add.length === 0 && !p.hold));
  const windShown = !!field && !point.problem && (end.direct || !!windWords(reported));
  // Two blocks under the field's line, Landing and Takeoff, each its row
  // with its runway's pill beside its name, a stop both, the destination
  // Landing, the departure Takeoff (the owner, 2026-11-24: "Maybe each stop
  // should have two sections, Landing and Takeoff. No need for runways in
  // the section title because that can be seen from the pill"): Landing's
  // arrival, approach and missed approach under its row, Takeoff's
  // departure under its.
  const editing = opens && open;
  const partOf = (role: "Arrive" | "Depart") => (editing ? shownParts.find((p) => p.part.role === role) : undefined);
  const landingPart = partOf("Arrive");
  const takeoffPart = partOf("Depart");
  const landingOut = editing && (!!landingPart || beforeOut.length > 0 || missedHere);
  const takeoffOut = editing && (!!takeoffPart || afterOut.length > 0);
  // The route's own magenta goes on past the field's rows to the next line
  // where it is not the last, or ends at the last one's last row.
  const sections = beforeOut.length + afterOut.length + (missedHere ? 1 : 0);
  const onPast = !last || sections > 0 || (takeoffOut && !last);
  const grouped = sections > 0 || landingOut || takeoffOut;
  // A phase's runway, its pull-downs not yet picked ("+ STAR") and the
  // destination's hold, and a stop's leaving time, at its head's right.
  const phaseTray = (role: "Arrive" | "Depart") => {
    const linePart = role === "Arrive" ? landingPart : takeoffPart;
    // A straight-in approach's own runway, said and not offered, so the
    // Landing line says where it lands (the owner's review, 2026-11-24).
    const ownRunway = role === "Arrive" && straightIn ? approachRunway(approach?.name ?? "") : null;
    const said = ownRunway && (
      <span className={cn("shrink-0 font-semibold text-muted-foreground", TEXT.note)} data-testid="landing-runway">
        RWY {ownRunway}
      </span>
    );
    if (!linePart) return said || undefined;
    return (
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5" data-testid="timeline-chips" data-role={role}>
        <PartTray
          vm={vm}
          a={field!}
          part={linePart.part}
          noRunway={role === "Arrive" && straightIn}
          beside
          trailing={[
            ...(said ? [<span key="runway">{said}</span>] : []),
            ...linePart.add.map((k) => kindMenu(vm, field!, k, "add")),
            ...(linePart.hold
              ? [<HoldChip key="hold" ident={point.ident} hold={vm.holdOn(point.ident)} onOpen={() => askHold(vm, point.ident, row)} />]
              : []),
          ]}
        />
      </span>
    );
  };
  // Landing and Takeoff, each a section that folds: its head a small label,
  // its runway's pill and a stop's leaving time on the same line at the
  // right, so folded it says them, and its procedures under it (the
  // owner, 2026-11-24, "Ok let's try it", of the redesign on KPWK); folded
  // at first, as every section. In flight or a dry run, where the list is
  // read, the procedures alone.
  const landingRows = (
    <>
      {beforeOut.map((k, i) => (
        <TimelineProcedureRows
          key={k}
          vm={vm}
          field={field!}
          kind={k}
          fixTime={point.fixTime}
          stop={last && !missedHere && afterOut.length === 0 && i === beforeOut.length - 1}
        />
      ))}
      {missedHere && <MissedApproach vm={vm} field={field!} stop={last && afterOut.length === 0} />}
    </>
  );
  const takeoffRows = (
    <>
      {afterOut.map((k, i) => (
        <TimelineProcedureRows key={k} vm={vm} field={field!} kind={k} fixTime={point.fixTime} stop={last && i === afterOut.length - 1} />
      ))}
    </>
  );
  const phaseHead = (role: "Arrive" | "Depart") => (
    <span className={cn("block font-semibold tracking-wide text-procedure uppercase", TEXT.note)}>
      {role === "Arrive" ? "Landing" : "Takeoff"}
    </span>
  );
  const landingFlown = beforeOut.length > 0 || missedHere;
  const landing = landingOut ? (
    <FoldSection
      head={phaseHead("Arrive")}
      trailing={phaseTray("Arrive")}
      chevron={landingFlown}
      stop={last && !takeoffOut}
      thread={landingFlown || takeoffOut || !last ? "solid" : "none"}
      testId="field-landing"
      nest
      label={`${point.ident} landing`}
      startOpen={!!vm.openAtFirst}
    >
      {landingRows}
    </FoldSection>
  ) : (
    landingRows
  );
  const takeoff = takeoffOut ? (
    <FoldSection
      head={phaseHead("Depart")}
      trailing={phaseTray("Depart")}
      chevron={afterOut.length > 0}
      stop={last}
      thread={afterOut.length > 0 || !last ? "solid" : "none"}
      testId="field-takeoff"
      nest
      label={`${point.ident} takeoff`}
      startOpen={!!vm.openAtFirst}
    >
      {takeoffRows}
    </FoldSection>
  ) : (
    takeoffRows
  );
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
        {onPast && <span aria-hidden="true" className={TIMELINE_THREAD} />}
      </span>
      <div className={cn("min-w-0 flex-1", TIMELINE_END, !first && !grouped && "border-t border-border")}>
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
          {/* At least four letters wide at the name's own size, so every
              line's fuel and wind start in one column (the owner,
              2026-11-24: "Fuel and winds should line up for all the
              stops"); a longer name pushes them on. */}
          <div className={cn("flex min-w-[3.2em] shrink flex-col", TEXT.row)}>
            <LineIdent point={point} change={end.change} onInfo={() => vm.onInfo(point.ident)} fuelSet={!!fuelSet} />
          </div>
          {/* The fuel right after the ident, the time at the right (the
              owner, 2026-11-17: "Fuel should go right after airport"; kept
              as the gauge, 2026-11-20: "I like the previous fuel tanks"). */}
          {/* Tapped to set the fuel leaving a field (FuelSet), where the
              list edits the route: the departure's on board, a stop's after
              fuelling; the destination's and a waypoint's read only. */}
          {/* The fuel over the field's wind, as the time over the altitude
              at the right (the owner, 2026-11-24: "Fuel and wind can be over
              each other like the eta and alt"). */}
          <span className="flex shrink-0 flex-col items-start">
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
            {windShown && <WindLine className="ml-2.5" direct={end.direct} wind={windWords(reported)} reported={reported} />}
          </span>
          <span className="flex-1" />
          {/* Its time over its altitude, as a procedure's fixes have theirs
              (the owner, 2026-11-24: "Under now just put altitude instead of
              time to match others"): a field's elevation, a waypoint's
              altitude flown, the pilot's own where set. */}
          <span className="relative z-10 ml-auto flex shrink-0 items-center" data-testid="timeline-time">
            {end.figures}
          </span>
          {/* No chevron at its end (the owner, 2026-11-19: "Also remove
              the chevrons"): the line itself is the tap that opens it. */}
          {end.grip}
          {trailing && <span className="relative z-10 flex h-11 shrink-0 items-center">{trailing}</span>}
        </div>
        <LineNotes point={point} refused={refused} />
      </div>
    </Collapsible>
  );
  // A field's line, with its procedures' rows, a region named as the list
  // read in flight names its step ("KDLH · Arrive"), so VoiceOver goes
  // from field to field.
  return (
    <div
      role={parts[0] ? "region" : undefined}
      aria-label={parts[0] ? `${point.ident} · ${parts[0].part.role}` : undefined}
      data-testid={grouped ? "field-group" : undefined}
      // Out to the card's leading inset and in from its edge by as much, so
      // the marks keep their column and the box shows its corners all round.
      className={cn(grouped && "my-1 mr-2 -ml-2 rounded-xl bg-procedure/8 pl-2 ring-1 ring-procedure/25 ring-inset")}
    >
      {line}
      {landingOut || takeoffOut ? (
        <PhaseCards landing={landingOut && landing} takeoff={takeoffOut && takeoff} into={onPast} out={!last} />
      ) : (
        <>
          {landing}
          {takeoff}
        </>
      )}
    </div>
  );
}
