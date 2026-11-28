import type { Inspections, Squawk } from "./api/types";
import type { GonogoFactor } from "./engine/contract";

/** A risk factor as the pages read it (the FRAT, the airworthiness checks). */
export interface RiskFactor {
  key: string;
  label: string;
  /** Why it counts: the rule or the reason. */
  why?: string;
  points: number;
  /** A factor that makes the flight unlawful as planned: high, whatever
   *  the points. */
  stop?: boolean;
  /** Its mark beside what the briefing raised, the engine's: a stop
   *  where it makes the flight unlawful or is high on its own, else a
   *  caution; none for a self check. */
  finding?: "stop" | "caution" | null;
}

/** A factor as the engine answers it, with its mark (the contract's). */
type EngineFactor = GonogoFactor;

/** A factor as the pages read it: `stop` only where it is one, the mark
 *  theirs to draw (RiskAssessment), a self check's group kept. */
export function riskFactor({ key, label, why, points, stop, group, finding }: EngineFactor): RiskFactor & { group?: string } {
  return {
    key,
    label,
    ...(why != null ? { why } : {}),
    points,
    ...(stop ? { stop } : {}),
    ...(group ? { group } : {}),
    ...(finding ? { finding } : {}),
  };
}

/** The inspections as the engine reads them, in snake_case. */
export function inspectionsInput(i: Inspections) {
  return {
    annual_good_through: i.annualGoodThrough ?? null,
    elt_inspection_good_through: i.eltInspectionGoodThrough ?? null,
    elt_battery_due_on: i.eltBatteryDueOn ?? null,
    static_check_good_through: i.staticCheckGoodThrough ?? null,
    transponder_check_good_through: i.transponderCheckGoodThrough ?? null,
    // Whether the 100-hour is owed (14 CFR 91.409(b)) is the engine's,
    // from the owner's word that the airplane is flown for hire.
    hundred_hour_due_at_hours: i.hundredHourDueAtHours ?? null,
    // Not said (null) stays not said: the engine weighs it as for hire.
    for_hire: i.forHire ?? null,
    hours_now: i.hoursNow ?? null,
  };
}

/** The squawks as the engine reads them. */
export function squawksInput(open: Squawk[]) {
  return open.map((s) => ({ text: s.text, inoperative: s.inoperative, deferred_for: s.deferredFor ?? null }));
}
