/**
 * What a pilot needs to fly into a Class B, C or D airspace area, and the
 * speeds in and under it, as 14 CFR part 91 says them (eCFR, current on
 * 2026-10-30): each a rule and the section it comes from, for the
 * airspace's card (AirspaceCard). VFR, in the 48 states, for a civil
 * airplane with an engine-driven electrical system: the exceptions for
 * gliders, balloons and the rest (91.215(b)(3), 91.225(e)) are left out.
 *
 * The shared engine's (engine/crates/airspace/src/rules.rs entry_rules, through
 * lib/engine), beside the rules of each band of the airspace over a point
 * the planner and the phones answer, from the same figures.
 */
import { callEngine, type EngineAnswer } from "./engine/engine";

type AirspaceRule = EngineAnswer<"airspace_entry_rules">["rules"][number];

export function entryRules(airspaceClass: "B" | "C" | "D"): AirspaceRule[] {
  return callEngine("airspace_entry_rules", { class: airspaceClass }).rules;
}

/** The frequencies to call before entering, from the primary airport's
 *  (NASR FRQ): approach for a Class B or C, the tower for a Class D. */
export function callTypes(airspaceClass: "B" | "C" | "D"): string[] {
  return callEngine("airspace_entry_rules", { class: airspaceClass }).call;
}

type SpecialVfrLine = EngineAnswer<"special_vfr">["needs"][number];

/** Special VFR in an airport's surface area (14 CFR 91.157), for the
 *  volume's card: what it asks, each with its rule, or what rules it out
 *  there -- an airport of part 91 appendix D, section 3, where an
 *  airplane may not fly it. The engine's (`special_vfr`). */
export function specialVfr(airspaceClass: "B" | "C" | "D", airport: string | null): { available: boolean; lines: SpecialVfrLine[] } {
  const a = callEngine("special_vfr", { surface_area: airspaceClass, airport });
  return { available: a.available, lines: a.available ? a.needs : a.problems };
}
