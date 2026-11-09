import type { Inspections, Squawk } from "./api/types";
import type { GonogoFactor } from "./engine/contract";
import type { RiskFactor } from "./frat";

/** A factor as the engine answers it, with its mark (the contract's). */
type EngineFactor = GonogoFactor;

/** A factor as the pages read it: `stop` only where it is one, the mark
 *  theirs to draw (RiskAssessment), a self check's group kept. */
export function riskFactor({ key, label, why, points, stop, group, finding }: EngineFactor): RiskFactor & { group?: string } {
  return { key, label, ...(why != null ? { why } : {}), points, ...(stop ? { stop } : {}), ...(group ? { group } : {}), ...(finding ? { finding } : {}) };
}

/** The inspections as the engine reads them, in snake_case. */
export function inspectionsInput(i: Inspections) {
  return {
    annual_good_through: i.annualGoodThrough ?? null, elt_inspection_good_through: i.eltInspectionGoodThrough ?? null,
    elt_battery_due_on: i.eltBatteryDueOn ?? null, static_check_good_through: i.staticCheckGoodThrough ?? null,
    transponder_check_good_through: i.transponderCheckGoodThrough ?? null,
    // The 100-hour is owed only by an airplane flown for hire (14 CFR
    // 91.409(b)), as its owner says: not one, not weighed.
    hundred_hour_due_at_hours: i.forHire ? i.hundredHourDueAtHours ?? null : null, hours_now: i.hoursNow ?? null,
  };
}

/** The squawks as the engine reads them. */
export function squawksInput(open: Squawk[]) {
  return open.map(s => ({ text: s.text, inoperative: s.inoperative, deferred_for: s.deferredFor ?? null }));
}

