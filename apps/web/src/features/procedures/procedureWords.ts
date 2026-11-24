import { runwayNumber, type Landing, type ProcedureAirport, type ProcedureKind } from "../plan";
import { dayMonthYear, feet } from "../../lib/format";
import { fixRoles, type BranchFix } from "../../lib/procedures";

// The words FPL's route list (ProceduresRoute) says of a field's
// procedures and pattern, apart from the parts that draw them.

type Kind = ProcedureKind;

/** A kind as its list's title says it (listTitle, ProcedurePicker). */
export const KIND_TITLE: Record<Kind, string> = { approach: "Approaches", arrival: "Arrivals", departure: "Departures" };
/** A kind as a branch's head says it, under the procedure's name. */
export const KIND_WORD: Record<Kind, string> = { approach: "Approach", arrival: "Arrival", departure: "Departure" };

/** A kind as a chip says it, "+ APCH", and as a procedure's tag before its
 *  name on FPL's list, "APCH RNAV (GPS) RWY 05" (the owner, 2026-11-24). */
export const KIND_TAG: Record<Kind, string> = { approach: "APCH", arrival: "ARR", departure: "DEP" };

/** "KDLH approaches": a kind's list's title. */
export function listTitle(ident: string, kind: Kind): string {
  return `${ident} ${KIND_TITLE[kind].toLowerCase()}`;
}

/** The runway picked, as its field's info says it: the pattern's side and
 *  height, or with an approach, straight in or a circle to land. */
export function patternNote(a: ProcedureAirport, chosen: string | null, landing: Landing | null): string | null {
  if (chosen === null) return null;
  if (landing) return chosen === landing.runway ? "Straight in" : "Circle to land";
  const end = (a.runways ?? []).flatMap((r) => r.runway_ends ?? []).find((e) => runwayNumber(e.ident) === chosen);
  // Left unless the FAA flags it right (14 CFR 91.126(b)(1)).
  const side = end ? `Runway ${chosen}, ${end.traffic === "right" ? "right" : "left"} traffic` : `Runway ${chosen}`;
  return [side, a.patternAltitudeFt != null ? feet(a.patternAltitudeFt) : null].filter(Boolean).join(" · ");
}

/** A CIFP cycle's first day, "261001" as "1 Oct 2026" (lib/format's
 *  dayMonthYear, the app's one form, CODE-33): a calendar day, made in the
 *  device's own time so it is not read a day early west of Greenwich. */
export function cycleDate(cycle: string): string {
  const at = new Date(2000 + Number(cycle.slice(0, 2)), Number(cycle.slice(2, 4)) - 1, Number(cycle.slice(4, 6)));
  return Number.isNaN(at.getTime()) ? cycle : dayMonthYear(at);
}

/** A fix's line under its name: the parts it plays, and sent direct to it
 *  or past it, "direct to" or "skipped" after them. */
export function fixSub(fix: BranchFix, isDirect: boolean, skipped: boolean): string {
  const roles = fixRoles(fix).join(" · ");
  const lead = roles ? `${roles} · ` : "";
  return isDirect ? `${lead}direct to` : skipped ? `${lead}skipped` : roles;
}
