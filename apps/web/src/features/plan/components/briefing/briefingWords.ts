import { altFt } from "../../format";
import type { SuaWhen, TfrWhen } from "../../lib/passTimes";
import type { Finding } from "../../../../lib/findings";

// The words the briefing's parts share (FlightBriefingView), apart from
// the small parts that draw them (BriefingBits).

/** The altitude range a hazard covers, worded around whichever bound
 *  is actually known -- an advisory with no upper limit reported (or
 *  no lower one) is common, and "—-35,000 ft" reads like a typo. */
export function hazardAltitudeRange(lowFt: number | null, highFt: number | null): string | null {
  if (lowFt == null && highFt == null) return null;
  if (lowFt == null) return `up to ${altFt(highFt)} ft`;
  if (highFt == null) return `${altFt(lowFt)} ft and above`;
  return `${altFt(lowFt)}-${altFt(highFt)} ft`;
}

/** A special-use area's word for the pass: its times of use's
 *  (features/plan/lib/passTimes), or SFDPS's status now where it holds then
 *  (lib/liveReports liveWhen). */
type AreaWhen = SuaWhen | "active-now" | "cold-now";

/** What a special-use area's times of use, or SFDPS, say for the pass. */
export const SUA_WORDS: Record<AreaWhen, string> = {
  "active": "scheduled in use then",
  "by-notam": "not scheduled then, but a NOTAM can activate it",
  "not-scheduled": "not scheduled then",
  "unknown": "read its times against yours",
  "active-now": "active now (FAA SFDPS)",
  "cold-now": "cold now (FAA SFDPS)",
};
export const SUA_FINDING: Record<AreaWhen, Finding> = {
  "active": "stop",
  "by-notam": "caution",
  "not-scheduled": "ok",
  "unknown": "caution",
  "active-now": "stop",
  "cold-now": "ok",
};
export const TFR_WORDS: Record<TfrWhen, string> = {
  "in-force": "in force then",
  "before": "before it starts",
  "after": "after it ends",
};
