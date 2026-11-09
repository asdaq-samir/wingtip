/**
 * An airport's runway visual range as the field card shows it: each
 * runway end's touchdown, midpoint and rollout readings (wingtip.rvr,
 * from STDDS's APDS), and whether the lowest is under the pilot's own
 * visibility minimum by the engine's rvr_check (14 CFR 91.175(h)(2)'s
 * comparable values; a minimum past 1 1/4 SM has no RVR that shows it,
 * and is not judged). The rule is the engine's; only the words are here.
 */
import type { RunwayRvr } from "./api/types";
import { callEngine } from "./engine/engine";

export interface RvrRow {
  runway: string;
  /** "6000+ · — · 6000+": touchdown, midpoint, rollout, ft. */
  readings: string;
  /** "Under your 1/2 SM minimum (14 CFR 91.175(h))", where it is. */
  under: string | null;
}

/** One reading: "6000+" at the system's most (AIM 7-1-13), "—" where none. */
export function readingWords(ft: number | null | undefined, more: boolean | undefined): string {
  if (ft == null) return "—";
  return more ? `${ft}+` : String(ft);
}

/** A visibility as a pilot says a minimum: "1/2", "1 1/4", "3". */
export function smWords(sm: number): string {
  const whole = Math.floor(sm);
  const eighths = Math.round((sm - whole) * 8);
  const fraction = eighths === 0 ? "" : eighths % 4 === 0 ? "1/2" : eighths % 2 === 0 ? `${eighths / 2}/4` : `${eighths}/8`;
  return [whole ? String(whole) : "", fraction].filter(Boolean).join(" ") || "0";
}

/** The rows, runway end by runway end, judged against `minimumSm` (the
 *  pilot's own visibility minimum, statute miles) where one is set. */
export function rvrRows(runways: RunwayRvr[], minimumSm: number | null): RvrRow[] {
  const checked = callEngine("rvr_check", {
    runways: runways.map(r => ({ runway: r.runway, touchdown_ft: r.touchdown_ft ?? null, midpoint_ft: r.midpoint_ft ?? null, rollout_ft: r.rollout_ft ?? null })),
    minimum_sm: minimumSm,
  });
  return runways.map((r, i) => ({
    runway: r.runway,
    readings: [readingWords(r.touchdown_ft, r.touchdown_more), readingWords(r.midpoint_ft, r.midpoint_more), readingWords(r.rollout_ft, r.rollout_more)].join(" · "),
    under: checked.runways[i]?.under && minimumSm != null ? `Under your ${smWords(minimumSm)} SM minimum (14 CFR 91.175(h))` : null,
  }));
}
