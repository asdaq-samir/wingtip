import { useState } from "react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { kindMenu } from "./fieldParts";
import { FixList } from "./FixList";
import { KIND_WORD } from "./procedureWords";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/** Past this many fixes the box shows the first FOLDED_ROWS and a row to
 *  show the rest, so a long arrival does not run the field's line off the
 *  sheet at half. */
const MAX_ROWS = 6;
const FOLDED_ROWS = 5;

/** The box: the inset grouped list's card (TIMELINE_CARD's corner and
 *  edge), with no inset of its own, its rows laying out their own. */
const BOX = "overflow-x-clip rounded-(--radius-card) border border-border bg-card";

/**
 * A procedure picked at a field on FPL's timeline, its own grouped box
 * under the field's chips, always open (the owner, 2026-11-21: "Can we
 * make the selected approach a grouped box showing the fixes etc?"; it
 * was a light blue pill that opened them, whose name his iPhone's larger
 * text cut, "RNAV (GPS)-B · …"). Its head row is the procedure's name,
 * wrapping and never cut, its kind and how many fixes in a note's grey,
 * and at its end the button to pick another (ProcedureMenu's round one,
 * as FixBranch's head has it: Direct To, the plate, the lesson, the full
 * list); then a row a fix in the order they are flown, each with its
 * altitude and Direct To (FixList), hairlines between them. Past
 * MAX_ROWS fixes the first FOLDED_ROWS and "Show All N Fixes".
 */
export function TimelineProcedureBox({ vm, field, kind }: { vm: ProceduresRouteModel; field: ProcedureAirport; kind: Kind }) {
  const { inRoute, procedures, crossings, onProcedures, onFix } = vm;
  const [all, setAll] = useState(false);
  const placed = inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === kind);
  const chosen = placed && procedures.find((p) => sameField(p.ident, field.ident) && p.id === placed.id);
  if (!placed || !chosen) return null;
  const fixes = placed.fixes ?? [];
  const count = fixes.length ? ` · ${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}` : "";
  // Sent direct to a fix past the fold, every fix is shown, so the skipped
  // ones and the one flown to read as they are.
  const directAt = placed.direct ? fixes.findIndex((f) => f.ident === placed.direct) : -1;
  const folded = !all && fixes.length > MAX_ROWS && directAt < FOLDED_ROWS;
  return (
    <section className={BOX} aria-label={placed.label} data-testid="procedure-box" data-kind={kind}>
      <div className="flex min-h-11 items-center gap-2 py-1.5 pr-2 pl-3">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Wrapping, never cut: all of the name at any text size. */}
          <span className={cn("break-words", TEXT.row)} data-testid="procedure-box-name">
            {placed.label}
          </span>
          <span className={cn("text-muted-foreground", TEXT.note)}>
            {KIND_WORD[kind]}
            {count}
          </span>
        </div>
        {kindMenu(vm, field, kind, "button")}
      </div>
      <FixList
        boxed
        name={placed.label}
        fixes={folded ? fixes.slice(0, FOLDED_ROWS) : fixes}
        direct={placed.direct ?? null}
        crossings={crossings}
        onDirect={(fix) =>
          onProcedures(
            procedures.map((p) => (p === chosen ? { ...p, direct: fix } : p)),
            null,
          )
        }
        onOpen={(fix) => onFix(field.ident, kind, fix)}
      />
      {folded && (
        <Button
          variant="ghost"
          type="button"
          onClick={() => setAll(true)}
          data-testid="procedure-box-all"
          className={cn(
            "h-11 w-full justify-start rounded-none py-0 pr-4 pl-0 font-normal text-tint hover:bg-transparent pointer-coarse:active:bg-muted dark:hover:bg-transparent",
            TEXT.row,
          )}
        >
          <span className="ml-7 flex h-full flex-1 items-center border-t border-border">Show All {fixes.length} Fixes</span>
        </Button>
      )}
    </section>
  );
}
