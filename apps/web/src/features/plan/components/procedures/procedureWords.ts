import { runwayNumber } from "../../lib/pattern";
import { altFt } from "../../../../lib/format";
import type { ProcedureAirport, ProcedureKind } from "../../hooks/useProceduresRoute";
import type { Landing } from "./PatternChips";

// The words FPL's route list (ProceduresRoute) says of a field's
// procedures and pattern, apart from the parts that draw them.

type Kind = ProcedureKind;

/** A kind as its list's title says it (listTitle, ProcedurePicker). */
export const KIND_TITLE: Record<Kind, string> = { approach: "Approaches", arrival: "Arrivals", departure: "Departures" };
/** A kind as a branch's head says it, under the procedure's name. */
export const KIND_WORD: Record<Kind, string> = { approach: "Approach", arrival: "Arrival", departure: "Departure" };

/** "KDLH approaches": a kind's list's title. */
export function listTitle(ident: string, kind: Kind): string {
  return `${ident} ${KIND_TITLE[kind].toLowerCase()}`;
}

/** The runway picked, as its field's info says it: the pattern's side and
 *  height, or with an approach, straight in or a circle to land. */
export function patternNote(a: ProcedureAirport, chosen: string | null, landing: Landing | null): string | null {
  if (chosen === null) return null;
  if (landing) return chosen === landing.runway ? "Straight in" : "Circle to land";
  const end = (a.runways ?? []).flatMap(r => r.runway_ends ?? []).find(e => runwayNumber(e.ident) === chosen);
  // Left unless the FAA flags it right (14 CFR 91.126(b)(1)).
  const side = end ? `Runway ${chosen}, ${end.traffic === "right" ? "right" : "left"} traffic` : `Runway ${chosen}`;
  return [side, a.patternAltitudeFt != null ? `${altFt(a.patternAltitudeFt)} ft` : null].filter(Boolean).join(" · ");
}
