import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { PointMenu } from "../route/lazy";
import { kindMenu } from "./fieldParts";
import { FixFigures } from "./FixList";
import { fixSub, KIND_WORD } from "./procedureWords";
import { TIMELINE_END, TIMELINE_GAP, TIMELINE_THREAD } from "./TimelineRows";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/** A row on the route's line: its mark (none for the procedure's head) in
 *  the marks' column, the route's magenta through it from top to bottom
 *  and on into the next row -- to the mark's middle on the route's last
 *  row (`stop`) -- and its words after the inset hairline. */
function OnTheLine({ mark, stop, children }: { mark?: ReactNode; stop: boolean; children: ReactNode }) {
  return (
    <div className={cn("relative flex", TIMELINE_GAP)}>
      <span className="relative flex w-8 shrink-0 items-center justify-center self-stretch">
        <span aria-hidden="true" className={cn(TIMELINE_THREAD, "top-0", stop && "bottom-1/2")} />
        {mark && <span className="relative z-10 flex">{mark}</span>}
      </span>
      <div className={cn("flex min-h-11 min-w-0 flex-1 items-center gap-2 border-t border-border", TIMELINE_END)}>{children}</div>
    </div>
  );
}

/** The procedure's name as its head says it: an approach's without its
 *  runway, then the runway it lands on -- its own, or the one picked to
 *  circle to -- "RNAV (GPS)-B · RWY 24"; an arrival's and a departure's
 *  with their transition, as the route says them. */
function headName(vm: ProceduresRouteModel, field: ProcedureAirport, placed: ProceduresRouteModel["inRoute"][number]) {
  if (placed.kind !== "approach" || !placed.name) return placed.label;
  const own = /\bRWY\s*(\S+)$/i.exec(placed.name)?.[1] ?? null;
  const runway = own ?? vm.chosenAt(field.ident);
  const short = placed.name.replace(/\s*RWY\s*\S+$/i, "");
  return runway ? `${short} · RWY ${runway}` : short;
}

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
  const face = (
    <>
      <span className={cn("block font-semibold tracking-wide text-procedure uppercase", TEXT.note)}>
        {KIND_WORD[kind]} · {field.ident}
      </span>
      {/* Wrapping, never cut: all of the name at any text size. */}
      <span className={cn("block font-semibold break-words", TEXT.row)} data-testid="procedure-name">
        {name}
      </span>
    </>
  );
  return (
    <section aria-label={placed.label} data-testid="procedure-rows" data-kind={kind}>
      <OnTheLine stop={stop && fixes.length === 0}>{kindMenu(vm, field, kind, "row", face)}</OnTheLine>
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
                  ? "border-tint bg-tint text-white"
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
                stop={stop && i === fixes.length - 1}
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
                  <span className={cn("font-semibold", TEXT.row, isDirect && "text-tint")}>{fix.ident}</span>
                  {sub && <span className={cn(TEXT.note, isDirect ? "font-semibold text-tint" : "text-muted-foreground")}>{sub}</span>}
                </BaseButton>
                <FixFigures fix={fix} own={crossings[fix.ident] ?? null} />
              </OnTheLine>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
