import type { ReactNode } from "react";
import { cn } from "cn";
import { ListGroup, ListRow } from "../../components/GroupedList";
import { Button } from "../../components/ui/button";
import { sameField, type BranchFix } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { kindMenu } from "./fieldParts";
import { FixFigures } from "./FixList";
import { approachAt, headName } from "./approachState";
import { OnTheLine, ProcedureFace } from "./onTheLine";
import { fixSub, KIND_WORD } from "./procedureWords";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import type { ProceduresRouteModel } from "./useProceduresRoute";

// An approach on FPL's timeline as a GPS navigator has one, at the owner's
// ask (2026-11-22: "When approach is loaded it should be a grouped box
// with no magenta connection, and should have an activate button to join
// it to magenta. And a remove button to remove it. When activated it
// should have the deactivate and remove buttons." -- "And also the suspend
// and unsuspend of the missed approach."): loaded, a box off the route's
// line; activated, its fixes on the line (TimelineProcedureRows); its
// missed approach a part of its own, suspended at the MAP until the pilot
// goes on into it (AIM 5-4-21, the engine's procedure_missed).

/** Activate or Deactivate, and Remove: Remove takes the approach out by
 *  its id -- the field's list, which says a pick's kind, is not fetched
 *  until a menu opens -- with the plan's Undo toast ("Procedure Removed"). Stock
 *  buttons, 36 tall, each 44 to a finger by the base layer's hit area
 *  (index.css), at gap-2 so the areas meet; nothing grows. */
export function ApproachButtons({
  vm,
  field,
  id,
  loaded,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  id: string;
  loaded: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <Button
        variant={loaded ? "default" : "secondary"}
        onClick={() => vm.onApproach(field.ident, id, { loaded: !loaded })}
        data-testid={loaded ? "approach-activate" : "approach-deactivate"}
      >
        {loaded ? "Activate" : "Deactivate"}
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          vm.onProcedures(
            vm.procedures.filter((p) => !(sameField(p.ident, field.ident) && p.id === id)),
            null,
          )
        }
        data-testid="approach-remove"
      >
        Remove
      </Button>
    </div>
  );
}

/** A box in the words' column, off the route's line: the magenta passes
 *  by in the marks' column where the route goes on past it (`through`),
 *  no mark on it, so nothing in the box is joined to it. */
function OffTheLine({ through, children }: { through: boolean; children: ReactNode }) {
  return (
    <div className={cn("relative flex", TIMELINE_GAP)}>
      <span className="relative w-8 shrink-0 self-stretch">
        {through && <span aria-hidden="true" className={cn(TIMELINE_THREAD, "top-0")} />}
      </span>
      <div className={cn("min-w-0 flex-1 py-2", TIMELINE_END)}>{children}</div>
    </div>
  );
}

/** A fix's row in a box: its name, the parts it plays and its altitudes;
 *  a tap its card where it has one (the approach's own, not the missed
 *  approach's). */
function BoxFix({ fix, own, onOpen }: { fix: BranchFix; own: number | null; onOpen?: () => void }) {
  return (
    <ListRow
      title={fix.ident}
      description={fixSub(fix, false, false) || undefined}
      value={<FixFigures fix={fix} own={own} />}
      onClick={onOpen}
    />
  );
}

/** The field's approach loaded: one grouped box of its fixes, not on the
 *  route's line and not in the nav log, with Activate and Remove. */
export function LoadedApproach({ vm, field, through }: { vm: ProceduresRouteModel; field: ProcedureAirport; through: boolean }) {
  const placed = approachAt(vm, field);
  if (!placed?.loaded) return null;
  const face = <ProcedureFace word={`${KIND_WORD.approach} loaded`} ident={field.ident} name={headName(vm, field, placed)} />;
  return (
    <OffTheLine through={through}>
      <section aria-label={`${placed.label}, loaded`} data-testid="approach-loaded">
        <ListGroup>
          <div className="flex min-h-11 items-center px-3">{kindMenu(vm, field, "approach", "row", face)}</div>
          {(placed.fixes ?? []).map((fix, i) => (
            <BoxFix
              key={`${fix.ident}-${i}`}
              fix={fix}
              own={vm.crossings[fix.ident] ?? null}
              onOpen={() => vm.onFix(field.ident, "approach", fix.ident)}
            />
          ))}
          <div className="px-3">
            <ApproachButtons vm={vm} field={field} id={placed.id} loaded />
          </div>
        </ListGroup>
      </section>
    </OffTheLine>
  );
}

/** Its head: the part and where the route is suspended, "SUSP" at the
 *  MAP as a GPS navigator says it, and Unsuspend or Suspend. */
function MissedHead({
  vm,
  field,
  id,
  flown,
  at,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  id: string;
  flown: boolean;
  at: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <span className={cn("block font-semibold tracking-wide text-procedure uppercase", TEXT.note)}>Missed Approach · {field.ident}</span>
        <span className={cn("block", TEXT.detail, flown ? "text-foreground" : "text-muted-foreground")} data-testid="missed-state">
          {flown ? "Flown on from the MAP" : `SUSP${at ? ` at ${at}` : ""}`}
        </span>
      </div>
      <Button
        variant="secondary"
        onClick={() => vm.onApproach(field.ident, id, { missed: !flown })}
        data-testid={flown ? "missed-suspend" : "missed-unsuspend"}
      >
        {flown ? "Suspend" : "Unsuspend"}
      </Button>
    </div>
  );
}

/** The field's activated approach's missed approach, its own part after the
 *  field's line: suspended, a dimmed box off the line; unsuspended, its
 *  fixes on the route's magenta, flown on to its hold. */
export function MissedApproach({ vm, field, stop }: { vm: ProceduresRouteModel; field: ProcedureAirport; stop: boolean }) {
  const placed = approachAt(vm, field);
  const fixes = placed?.missedFixes ?? [];
  if (!placed || placed.loaded || fixes.length === 0) return null;
  const head = <MissedHead vm={vm} field={field} id={placed.id} flown={!!placed.missed} at={placed.suspendAt ?? null} />;
  if (!placed.missed) {
    return (
      <OffTheLine through={!stop}>
        <section
          aria-label={`${field.ident} missed approach, suspended`}
          data-testid="missed-approach"
          data-flown="false"
          className="opacity-60"
        >
          <ListGroup>
            <div className="px-3">{head}</div>
            {fixes.map((fix, i) => (
              <BoxFix key={`${fix.ident}-${i}`} fix={fix} own={null} />
            ))}
          </ListGroup>
        </section>
      </OffTheLine>
    );
  }
  const ring = <span className="grid size-8 place-items-center rounded-full border-2 border-procedure bg-card" />;
  return (
    <section aria-label={`${field.ident} missed approach`} data-testid="missed-approach" data-flown="true">
      <OnTheLine stop={false}>{head}</OnTheLine>
      <ol aria-label={`${field.ident} missed approach, its fixes`}>
        {fixes.map((fix, i) => (
          <li key={`${fix.ident}-${i}`} data-testid="missed-fix-row">
            <OnTheLine stop={stop && i === fixes.length - 1} mark={ring}>
              <span className="flex min-w-0 flex-1 flex-col justify-center py-1">
                <span className={cn("font-normal", TEXT.row)}>{fix.ident}</span>
                {fixSub(fix, false, false) && <span className={cn(TEXT.note, "text-muted-foreground")}>{fixSub(fix, false, false)}</span>}
              </span>
              <FixFigures fix={fix} own={null} />
            </OnTheLine>
          </li>
        ))}
      </ol>
    </section>
  );
}
