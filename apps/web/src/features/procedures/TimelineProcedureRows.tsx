import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Ellipsis } from "lucide-react";
import { cn } from "cn";
import { fixRoles, sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { PointMenu } from "../route/lazy";
import { kindMenu } from "./fieldParts";
import { FixFigures } from "./FixList";
import { fixSub, KIND_WORD } from "./procedureWords";
import { ApproachButtons } from "./TimelineApproachParts";
import { headName } from "./approachState";
import { FoldSection, OnTheLine, ProcedureFace } from "./onTheLine";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/**
 * A procedure picked at a field on FPL's timeline, its fixes points on
 * the route's magenta line itself in the order they are flown, at the
 * owner's pick (option D, 2026-11-21, of the canvas NgAKy71YahLtp5mZtMDAoH),
 * a section of its field's group under the field's line (FoldSection).
 * Its head the kind in the procedure's indigo, small capitals
 * ("APPROACH"), over its name ("RNAV (GPS)-B · RWY 24"), wrapping, never
 * cut: a tap folds its fixes away under it and back (the owner,
 * 2026-11-24: "Tapping it should fold the procedure"), the kind's menu to
 * pick another (ProcedureMenu) a round button at its end. An approach
 * loaded, not activated, is the same on a dashed line. Then a row a fix, its mark a ring in
 * the indigo with "•••", its menu (Direct To, its altitude and card, as
 * FixList's •••), its name -- a tap opens its card (FixCard) -- the parts
 * it plays under it, and its altitude at the right. Sent direct to one,
 * its ring filled in the tint and those before it dashed, skipped.
 */
export function TimelineProcedureRows({
  vm,
  field,
  kind,
  fixTime,
  stop = false,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  kind: Kind;
  /** Each fix's time, as the field's line has its own (TimelinePoint). */
  fixTime: (fix: string) => ReactNode;
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
  // An approach says at its foot whether it is activated, with Activate or
  // Deactivate and Remove (TimelineApproachParts). Loaded, not activated,
  // its fixes are on a dashed line, not flown and not in the nav log.
  const approach = kind === "approach";
  const times = fixes.map((f) => fixTime(f.ident));
  const timed = times.some((t) => t != null);
  const loaded = approach && !!placed.loaded;
  const face = <ProcedureFace word={loaded ? `${KIND_WORD[kind]} loaded` : KIND_WORD[kind]} name={name} />;
  const thread = loaded ? "dashed" : "solid";
  return (
    <FoldSection
      head={face}
      stop={stop}
      thread={thread}
      testId={loaded ? "approach-loaded" : "procedure-rows"}
      label={loaded ? `${placed.label}, loaded` : placed.label}
      data={{ "data-kind": kind }}
      startOpen={!!vm.openAtFirst}
      // Change and Remove, an approach's Activate or Deactivate before
      // them: at its fixes' foot, under its head while folded.
      foot={(open) => (
        // One block with the head while folded, no hairline between
        // (the owner's review, 2026-11-24).
        <OnTheLine stop={stop} thread={thread} rule={open}>
          <ApproachButtons
            vm={vm}
            field={field}
            id={placed.id}
            loaded={approach ? loaded : undefined}
            change={kindMenu(vm, field, kind, "change")}
          />
        </OnTheLine>
      )}
    >
      <ol aria-label={`${name}, its fixes`}>
        {fixes.map((fix, i) => {
          const isDirect = i === directAt;
          // Not flown: left out by a Direct to, or by the path the plan
          // flies where it times the procedure's other fixes and not this
          // one (a course reversal flown in its place: KDLH's CFBSJ),
          // dimmed on a dashed ring (the owner's review, 2026-11-24).
          const notFlown = !isDirect && times[i] == null && timed;
          const skipped = (directAt > 0 && i < directAt) || notFlown;
          const sub =
            notFlown && !(directAt > 0 && i < directAt)
              ? [fixRoles(fix).join(" · "), "not flown"].filter(Boolean).join(" · ")
              : fixSub(fix, isDirect, skipped);
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
                thread={thread}
                stop={false}
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
                  className={cn(
                    "flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 self-stretch py-1 content-center text-left",
                    skipped && "opacity-50",
                  )}
                >
                  {/* In the regular weight, as the route's points are on the same
                      line (the owner, 2026-11-20: "Stops font can be
                      non-bold"); the procedure's name over them stays its
                      head's bold. */}
                  <span className={cn("font-normal", TEXT.row, isDirect && "font-semibold text-tint")}>{fix.ident}</span>
                  {/* Its parts on its own line after its name, "DL · IAF", a
                      row a fix (the owner's review, 2026-11-24). */}
                  {sub && <span className={cn(TEXT.note, isDirect ? "font-semibold text-tint" : "text-muted-foreground")}>· {sub}</span>}
                </BaseButton>
                <FixFigures fix={fix} own={crossings[fix.ident] ?? null} time={times[i] ?? "—"} />
              </OnTheLine>
            </li>
          );
        })}
      </ol>
    </FoldSection>
  );
}
