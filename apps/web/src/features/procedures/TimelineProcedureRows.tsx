import type { ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "cn";
import { fixRoles, sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { PointMenu } from "../route/lazy";
import { FixFigures } from "./FixList";
import { fixSub, KIND_TAG, KIND_WORD } from "./procedureWords";
import { kindMenu } from "./fieldParts";
import { Button } from "../../components/ui/button";
import { headName, headSub } from "./approachState";
import { FoldSection, OnTheLine } from "./onTheLine";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/**
 * A procedure picked at a field on FPL's timeline, its fixes points on
 * the route's magenta line itself in the order they are flown, at the
 * owner's pick (option D, 2026-11-21, of the canvas NgAKy71YahLtp5mZtMDAoH),
 * a section of its field's group under the field's line (FoldSection).
 * Its head the kind in the procedure's indigo, small capitals
 * ("APPROACH"), over its name ("RNAV (GPS)-B"), wrapping, never
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
  fixTime: (fix: string, leaving: boolean) => ReactNode;
  /** The route ends at its last fix: the line stops at its mark. */
  stop?: boolean;
}) {
  const { inRoute, procedures, crossings, onProcedures, onFix } = vm;
  const placed = inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === kind);
  const chosen = placed && procedures.find((p) => sameField(p.ident, field.ident) && p.id === placed.id);
  if (!placed || !chosen) return null;
  const fixes = placed.fixes ?? [];
  const name = headName(placed);
  const directAt = placed.direct ? fixes.findIndex((f) => f.ident === placed.direct) : -1;
  const onDirect = (fix: string | null) =>
    onProcedures(
      procedures.map((p) => (p === chosen ? { ...p, direct: fix } : p)),
      null,
    );
  // An approach says at its head whether it is activated, Activate or
  // Deactivate. Loaded, not activated, its fixes are on a dashed line, not
  // flown and not in the nav log.
  const approach = kind === "approach";
  const times = fixes.map((f) => fixTime(f.ident, kind === "departure"));
  const timed = times.some((t) => t != null);
  const loaded = approach && !!placed.loaded;
  // Its pill's words on one line: its kind's tag small and grey, its name,
  // then its transition or the fix it goes direct to, grey, cut short
  // where the card is narrower (its fixes, opened, say them whole).
  const sub = headSub(placed);
  const face = (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate" data-testid="procedure-name">
      <span className={cn("shrink-0 text-muted-foreground", TEXT.note)}>{KIND_TAG[kind]}</span>
      <span className={cn("min-w-0 truncate font-semibold", TEXT.row)}>{name}</span>
      {sub && <span className={cn("min-w-0 shrink-[3] truncate text-muted-foreground", TEXT.note)}>{sub}</span>}
    </span>
  );
  const thread = loaded ? "dashed" : "solid";
  return (
    <FoldSection
      pill={(fold) => kindMenu(vm, field, kind, "wide", face, fold)}
      stop={stop}
      thread={thread}
      testId={loaded ? "approach-loaded" : "procedure-rows"}
      label={loaded ? `${placed.label}, loaded` : placed.label}
      data={{ "data-kind": kind }}
      startOpen={!!vm.openAtFirst}
      // Its menu is its pill's (the owner, 2026-11-25: "design these pills
      // to be like route box where they open a menu for their selection
      // ... Then we won't need ... at the end"); a loaded approach's
      // Activate in the pill before its chevron; activated, its
      // Deactivate is in the menu, as is Show Fixes (no chevron: the
      // owner, 2026-11-25, "do we need the chevrons?").
      trailing={
        loaded && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => vm.onApproach(field.ident, placed.id, { loaded: false })}
            data-testid="approach-activate"
          >
            Activate
          </Button>
        )
      }
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
          // A small dot on the line, not a stop's ringed "•••", so the
          // procedure's fixes read as points along it and its fields stand
          // out (the owner's review, 2026-11-24); its menu still a 44-point
          // tap round it.
          const ring = (
            <span className="grid size-8 place-items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "rounded-full ring-2 ring-card",
                  isDirect
                    ? "size-4 bg-primary"
                    : skipped
                      ? "size-3.5 border-2 border-dashed border-muted-foreground/60 bg-card"
                      : "size-3 bg-procedure",
                )}
              />
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
                {/* Not flown, its words say so and it has no time (the owner's
                    review, 2026-11-24). */}
                <FixFigures fix={fix} own={crossings[fix.ident] ?? null} time={notFlown ? null : (times[i] ?? "—")} />
              </OnTheLine>
            </li>
          );
        })}
      </ol>
    </FoldSection>
  );
}
