import { useState } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { ChevronDown, Ellipsis } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { PointMenu } from "../route/lazy";
import { kindMenu } from "./fieldParts";
import { FixFigures } from "./FixList";
import { fixSub, KIND_WORD } from "./procedureWords";
import { ApproachButtons } from "./TimelineApproachParts";
import { headName } from "./approachState";
import { OnTheLine, ProcedureFace } from "./onTheLine";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/**
 * A procedure picked at a field on FPL's timeline, its fixes points on
 * the route's magenta line itself in the order they are flown, at the
 * owner's pick (option D, 2026-11-21, of the canvas NgAKy71YahLtp5mZtMDAoH):
 * an approach's and an arrival's before the field's line, a departure's
 * after it. Its head row the kind and the field in the procedure's indigo,
 * small capitals ("APPROACH · C81"), over its name ("RNAV (GPS)-B · RWY
 * 24"), wrapping, never cut: the row a stock Collapsible's trigger that
 * folds its fixes away under it and back (the owner, 2026-11-24: "Tapping
 * it should fold the procedure"), the kind's menu to pick another
 * (ProcedureMenu) a round button at its end. Then a row a fix, its mark a ring in
 * the indigo with "•••", its menu (Direct To, its altitude and card, as
 * FixList's •••), its name -- a tap opens its card (FixCard) -- the parts
 * it plays under it, and its altitude at the right. Sent direct to one,
 * its ring filled in the tint and those before it dashed, skipped.
 */
export function TimelineProcedureRows({
  vm,
  field,
  kind,
  stop = false,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  kind: Kind;
  /** The route ends at its last fix: the line stops at its mark. */
  stop?: boolean;
}) {
  const { inRoute, procedures, crossings, onProcedures, onFix } = vm;
  const [open, setOpen] = useState(true);
  const placed = inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === kind);
  const chosen = placed && procedures.find((p) => sameField(p.ident, field.ident) && p.id === placed.id);
  if (!placed || !chosen) return null;
  const fixes = placed.fixes ?? [];
  const name = headName(vm, field, placed);
  const directAt = placed.direct ? fixes.findIndex((f) => f.ident === placed.direct) : -1;
  const onDirect = (fix: string | null) =>
    onProcedures(
      procedures.map((p) => (p === chosen ? { ...p, direct: fix } : p)),
      null,
    );
  const face = <ProcedureFace word={KIND_WORD[kind]} ident={field.ident} name={name} />;
  // An approach activated says so at its foot, with Deactivate and Remove
  // (TimelineApproachParts).
  const approach = kind === "approach";
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      render={<section aria-label={placed.label} data-testid="procedure-rows" data-kind={kind} data-folded={open ? undefined : ""} />}
    >
      {/* Folded, the route's line stops at the head where it ended at the
          procedure's last fix. */}
      <OnTheLine stop={stop && (!open || (fixes.length === 0 && !approach))}>
        <CollapsibleTrigger
          render={
            <Button
              variant="plain"
              size="inline"
              type="button"
              data-testid="procedure-fold"
              className="min-h-11 min-w-0 flex-1 gap-2 py-1.5 text-left font-normal whitespace-normal pointer-coarse:active:bg-muted"
            />
          }
        >
          <span className="min-w-0 flex-1">{face}</span>
          <ChevronDown
            className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-(--motion-fade)", !open && "-rotate-90")}
            aria-hidden
          />
        </CollapsibleTrigger>
        {kindMenu(vm, field, kind, "button")}
      </OnTheLine>
      {/* Base UI's own panel animation, the rows under it moving up as it
          folds (none with Reduce Motion, index.css). */}
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--motion-fade) ease-(--motion-sheet-ease) data-ending-style:h-0 data-starting-style:h-0">
        <ol aria-label={`${name}, its fixes`}>
          {fixes.map((fix, i) => {
            const skipped = directAt > 0 && i < directAt;
            const isDirect = i === directAt;
            const sub = fixSub(fix, isDirect, skipped);
            const ring = (
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border-2",
                  isDirect
                    ? "border-primary bg-primary text-primary-foreground"
                    : skipped
                      ? "border-dashed border-muted-foreground/50 bg-card text-muted-foreground"
                      : "border-procedure bg-card text-procedure",
                )}
              >
                <Ellipsis className="size-4" strokeWidth={2.4} aria-hidden="true" />
              </span>
            );
            return (
              <li key={`${fix.ident}-${i}`} data-testid="fix-branch-row" data-direct={isDirect ? "" : undefined}>
                <OnTheLine
                  stop={stop && i === fixes.length - 1 && !approach}
                  mark={
                    <PointMenu
                      bare
                      face={ring}
                      ident={fix.ident}
                      direct={isDirect}
                      testId="fix-branch-menu"
                      onDirect={() => onDirect(isDirect ? null : fix.ident)}
                      onAltitude={() => onFix(field.ident, kind, fix.ident)}
                    />
                  }
                >
                  <BaseButton
                    onClick={() => onFix(field.ident, kind, fix.ident)}
                    className={cn("flex min-w-0 flex-1 flex-col justify-center self-stretch py-1 text-left", skipped && "opacity-50")}
                  >
                    {/* In the regular weight, as the route's points are on the same
                      line (the owner, 2026-11-20: "Stops font can be
                      non-bold"); the procedure's name over them stays its
                      head's bold. */}
                    <span className={cn("font-normal", TEXT.row, isDirect && "font-semibold text-tint")}>{fix.ident}</span>
                    {sub && <span className={cn(TEXT.note, isDirect ? "font-semibold text-tint" : "text-muted-foreground")}>{sub}</span>}
                  </BaseButton>
                  <FixFigures fix={fix} own={crossings[fix.ident] ?? null} />
                </OnTheLine>
              </li>
            );
          })}
        </ol>
        {approach && (
          <OnTheLine stop={stop}>
            <ApproachButtons vm={vm} field={field} id={placed.id} loaded={false} />
          </OnTheLine>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
