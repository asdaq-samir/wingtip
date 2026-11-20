import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Button } from "../../components/ui/button";
import { sameField } from "../../lib/procedures";
import { TEXT } from "../../lib/text";
import type { ProcedureAirport } from "../plan";
import { chipLook } from "./chipLook";
import { kindMenu } from "./fieldParts";
import { FixList } from "./FixList";
import { KIND_WORD } from "./procedureWords";
import type { ProceduresRouteModel } from "./useProceduresRoute";

type Kind = keyof typeof KIND_WORD;

/**
 * A procedure picked at a field on FPL's timeline, a light blue pill in
 * the field's chips (the owner, 2026-11-20: "When a procedure is picked
 * then it should become a light blue pill that can expand to show the
 * approach fixes etc"): the tint's light wash, as the runway's pill and
 * Add Fuel Stops are, its short name and a chevron that turns as it opens
 * its fixes under the chips (TimelineProcedureFixes). Where it was a grey
 * chip that opened the pick-another menu, that menu is now a button at
 * the head of its fixes.
 */
export function TimelineProcedurePill({
  ident,
  kind,
  label,
  open,
  panel,
  onToggle,
}: {
  ident: string;
  kind: Kind;
  label: string;
  open: boolean;
  /** The id of its fixes' panel, which it controls. */
  panel: string;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? panel : undefined}
      // Its name starts with the words it shows (WCAG 2.5.3, Label in Name).
      aria-label={`${label}, ${ident} ${KIND_WORD[kind].toLowerCase()}: its fixes`}
      data-testid="procedure-pill"
      data-kind={kind}
      className={cn(chipLook(false), "bg-tint/12 text-tint hover:bg-tint/20! dark:hover:bg-tint/20!")}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
    </Button>
  );
}

/** A pill's procedure open under the field's chips: its kind and how many
 *  fixes, the button to pick another at the right (ProcedureMenu's round
 *  one, as FixBranch's head has it), then its fixes in the order they are
 *  flown, each with its altitude and Direct To (FixList). */
export function TimelineProcedureFixes({
  vm,
  field,
  kind,
  id,
}: {
  vm: ProceduresRouteModel;
  field: ProcedureAirport;
  kind: Kind;
  id: string;
}) {
  const { inRoute, procedures, crossings, onProcedures, onFix } = vm;
  const placed = inRoute.find((p) => sameField(p.ident, field.ident) && p.kind === kind);
  const chosen = placed && procedures.find((p) => sameField(p.ident, field.ident) && p.id === placed.id);
  if (!placed || !chosen) return null;
  const fixes = placed.fixes ?? [];
  const count = fixes.length ? ` · ${fixes.length} ${fixes.length === 1 ? "fix" : "fixes"}` : "";
  return (
    <section id={id} className="basis-full" aria-label={`${placed.label}, its fixes`} data-testid="procedure-pill-fixes" data-kind={kind}>
      <div className="flex min-h-11 items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate text-muted-foreground", TEXT.note)}>
          {KIND_WORD[kind]}
          {count}
        </span>
        {kindMenu(vm, field, kind, "button")}
      </div>
      <FixList
        name={placed.label}
        fixes={fixes}
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
    </section>
  );
}
