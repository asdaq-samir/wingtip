import type { ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, Ellipsis } from "lucide-react";
import IconButton from "../../components/IconButton";
import { Button } from "../../components/ui/button";
import type { ProcedureSummary } from "../../lib/api/types";
import { chipLook } from "./chipLook";
import { KIND_TAG } from "./procedureWords";

type Kind = ProcedureSummary["kind"];

export const TITLE: Record<Kind, string> = { approach: "Approach", arrival: "Arrival", departure: "Departure" };
/** The trigger's word until one is picked, as short as it goes, at the
 *  owner's ask ("make the selections to be more compact: Arrive,
 *  Approach, Depart"). */
const SHORT: Record<Kind, string> = { approach: "Approach", arrival: "Arrive", departure: "Depart" };
/** A kind to add, on its chip: the FAA's contractions (FAA Order JO 7340.2,
 *  Contractions: ARR, APCH, DEP), at the owner's ask (2026-11-17: "shorten
 *  arrival to ARR and approach to APCH") so the row stays on one line. A
 *  reader still hears the whole word (its aria-label). */

/** How a kind's pull-down (ProcedureMenu) is opened: a chip; a round
 *  button at the right of the procedure's branch, to pick another
 *  (FixBranch, at the owner's ask: "the button on the right should be to
 *  reselect another approach"); none picked, "+ ARR" after the field's
 *  runways (the owner's pick, option C); or a whole row of FPL's timeline,
 *  its words `face` (TimelineProcedureRows, the owner's option D,
 *  2026-11-21: "just tapping it should show the approaches menu"). */
export type TriggerLook = "chip" | "button" | "add" | "row" | "more";

/**
 * ProcedureMenu's trigger, one element for ResponsivePopoverTrigger's
 * asChild: one line, the kind's name ("Approach") until one is picked
 * ("Just remove the word select"), then the one picked, its words black as
 * every glass button's are (the owner's D1, 2026-10-23: no tint on the
 * glass); its 44-point area a pseudo-element round it. A row's is its own
 * words and a chevron, a row's height and width.
 */
export function procedureTrigger({
  look,
  ident,
  kind,
  label,
  face,
}: {
  look: TriggerLook;
  ident: string;
  kind: Kind;
  label: string | null;
  face?: ReactNode;
}) {
  const what = `${ident} ${TITLE[kind].toLowerCase()}`;
  const data = { "data-testid": "procedure-kind", "data-kind": kind, "data-look": look };
  if (look === "row")
    return (
      <Button
        variant="plain"
        size="inline"
        type="button"
        {...data}
        className="min-h-11 w-full gap-2 py-1.5 text-left font-normal whitespace-normal pointer-coarse:active:bg-muted"
      >
        <span className="min-w-0 flex-1">{face}</span>
        <ChevronDown className="size-5 shrink-0 text-tint" aria-hidden />
        <span className="sr-only">, pick another</span>
      </Button>
    );
  if (look === "more")
    // A round "•••" at a procedure's head on FPL's list, its menu: another
    // of the kind, Direct to, its plate and No Approach to take it out (the
    // owner, 2026-11-24, where Change and Remove were a row of their own).
    return (
      <IconButton round label={`${what}: ${label ?? "none picked"}, options`} {...data}>
        <Ellipsis className="size-5" strokeWidth={2.4} />
      </IconButton>
    );
  if (look === "button")
    // The one picked's name kept in it for a reader, unseen: the branch's
    // head shows it.
    return (
      <IconButton round label={`${what}: ${label ?? "none picked"}, pick another`} {...data}>
        <ArrowLeftRight className="size-5" strokeWidth={2} />
        <span className="sr-only">{label ?? SHORT[kind]}</span>
      </IconButton>
    );
  // The stock Button's glass, a kind to add as one picked, at the owner's
  // pick of the sketches ("B"): it was a dashed outline. Its name starts
  // with the words it shows, "+ ARR" or the one picked (WCAG 2.5.3, Label
  // in Name: a voice user says what they see), then the whole word.
  return (
    <Button
      variant="glass"
      size="chip"
      {...data}
      className={chipLook(look === "add")}
      aria-label={look === "add" ? `+ ${KIND_TAG[kind]}, ${what}: none picked` : `${label ?? SHORT[kind]}, ${what}`}
    >
      {look === "add" ? <span>+ {KIND_TAG[kind]}</span> : <span className="truncate">{label ?? SHORT[kind]}</span>}
      {look !== "add" && <ChevronDown className="size-4 shrink-0" aria-hidden />}
    </Button>
  );
}
