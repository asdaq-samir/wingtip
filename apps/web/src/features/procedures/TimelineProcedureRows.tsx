import { Button as BaseButton } from "@base-ui/react/button";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
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
 * 24"), wrapping, never cut: the whole row one button that opens the
 * kind's menu to pick another (ProcedureMenu; the owner: "just tapping it
 * should show the approaches menu"). Then a row a fix, its mark a ring in
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
    <section aria-label={placed.label} data-testid="procedure-rows" data-kind={kind}>
      <OnTheLine stop={stop && fixes.length === 0 && !approach}>{kindMenu(vm, field, kind, "row", face)}</OnTheLine>
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
    </section>
  );
}

/**
 * A procedure picked at a field, as a pill on the field's own line: its
 * short title alone in the procedures' indigo, the pill the route box
 * draws (RouteChips' ProcedureChip), so the whole route fits the sheet at
 * half (the owner, 2026-11-23: "How do we make it compact on half with
 * procedures?", then the pick "Pill on its field"). A tap unfolds its
 * rows on the line (TimelineProcedureRows: its head, whose tap is the
 * kind's menu to change or remove it, and its fixes); again, folds them.
 */
export function ProcedurePill({
  vm,
  field,
  kind,
  open,
  onToggle,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  kind: Kind;
  open: boolean;
  onToggle: () => void;
}) {
  const placed = vm.inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === kind);
  if (!placed) return null;
  const name = headName(vm, field, placed);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${KIND_WORD[kind]} ${name}: its fixes`}
      data-testid="procedure-pill"
      data-kind={kind}
      className={cn(
        "relative h-7 max-w-full rounded-full bg-procedure/12 px-2.5 font-semibold text-procedure hit-x-1 hit-y-2 hover:bg-procedure/18 hover:text-procedure aria-expanded:bg-procedure/18",
        TEXT.note,
      )}
    >
      <span className="truncate">{name}</span>
    </Button>
  );
}
