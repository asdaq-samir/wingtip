import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { FixFigures } from "./FixList";
import { approachAt } from "./approachState";
import { FoldSection, OnTheLine } from "./onTheLine";
import { fixSub } from "./procedureWords";
import type { ProceduresRouteModel } from "./useProceduresRoute";

// An approach on FPL's timeline as a GPS navigator has one, at the owner's
// ask (2026-11-22: "When approach is loaded it should be a grouped box
// with no magenta connection, and should have an activate button to join
// it to magenta. And a remove button to remove it. When activated it
// should have the deactivate and remove buttons." -- "And also the suspend
// and unsuspend of the missed approach."): loaded, a box off the route's
// line; activated, its fixes on the line (TimelineProcedureRows); its
// missed approach a part of its own, suspended at the MAP until the pilot
// goes on into it (AIM 5-4-21, the engine's procedure_missed). Since
// 2026-11-24 each is a folding section of the field's group, on a dashed
// line where it is not flown yet (loaded; suspended).

/** The field's activated approach's missed approach, a section of its
 *  own in the field's group after the approach: its head the part and
 *  where the route is suspended, "SUSP" at the MAP as a GPS navigator
 *  says it, with Unsuspend or Suspend at its end; its fixes on a dashed
 *  line while it is suspended, on the route's magenta once the pilot goes
 *  on into it, flown on to its hold. */
export function MissedApproach({ vm, field, stop }: { vm: ProceduresRouteModel; field: ProcedureAirport; stop: boolean }) {
  const placed = approachAt(vm, field);
  const fixes = placed?.missedFixes ?? [];
  if (!placed || placed.loaded || fixes.length === 0) return null;
  const flown = !!placed.missed;
  const at = placed.suspendAt ?? null;
  // One line, as a procedure's head: "SUSP at RW09 (Missed approach)".
  const head = (
    <span className={cn("block break-words", TEXT.row)}>
      <span className="font-semibold" data-testid="missed-state">
        {flown ? "Flown on from the MAP" : `SUSP${at ? ` at ${at}` : ""}`}
      </span>{" "}
      <span className="text-procedure">(Missed approach)</span>
    </span>
  );
  const ring = (
    <span className={cn("grid size-8 place-items-center rounded-full border-2 border-procedure bg-card", !flown && "border-dashed")} />
  );
  return (
    <FoldSection
      head={head}
      trailing={
        <Button
          variant="secondary"
          onClick={() => vm.onApproach(field.ident, placed.id, { missed: !flown })}
          data-testid={flown ? "missed-suspend" : "missed-unsuspend"}
        >
          {flown ? "Suspend" : "Unsuspend"}
        </Button>
      }
      stop={stop}
      thread={flown ? "solid" : "dashed"}
      testId="missed-approach"
      label={flown ? `${field.ident} missed approach` : `${field.ident} missed approach, suspended`}
      data={{ "data-flown": String(flown) }}
      startOpen={!!vm.openAtFirst}
    >
      <ol aria-label={`${field.ident} missed approach, its fixes`}>
        {fixes.map((fix, i) => (
          <li key={`${fix.ident}-${i}`} data-testid="missed-fix-row">
            <OnTheLine stop={stop && i === fixes.length - 1} thread={flown ? "solid" : "dashed"} mark={ring}>
              <span className={cn("flex min-w-0 flex-1 flex-col justify-center py-1", !flown && "text-muted-foreground")}>
                <span className={cn("font-normal", TEXT.row)}>{fix.ident}</span>
                {fixSub(fix, false, false) && <span className={cn(TEXT.note, "text-muted-foreground")}>{fixSub(fix, false, false)}</span>}
              </span>
              <FixFigures fix={fix} own={null} />
            </OnTheLine>
          </li>
        ))}
      </ol>
    </FoldSection>
  );
}
