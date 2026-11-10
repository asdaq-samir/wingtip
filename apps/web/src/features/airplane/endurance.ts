import { callEngine } from "../../lib/engine/engine";
import type { EngineAnswer, EngineInput } from "../../lib/engine/engine";

type Reserve = EngineInput<"endurance">["reserve"];

/** The profile's endurance rows: to dry tanks, then after each reserve a
 *  pilot keeps back -- 30 minutes by day and 45 at night under VFR (14 CFR
 *  91.151(a)(1), (a)(2)), 45 under IFR (91.167(a)(3)) -- as the iPhone's
 *  and Android's profiles show them. */
const RESERVES: { reserve: Reserve; label: string; rule: string | null }[] = [
  { reserve: "none", label: "To Dry Tanks", rule: null },
  { reserve: "vfr_day", label: "VFR Day Reserve", rule: "14 CFR 91.151(a)(1)" },
  { reserve: "vfr_night", label: "VFR Night Reserve", rule: "14 CFR 91.151(a)(2)" },
  { reserve: "ifr", label: "IFR Reserve", rule: "14 CFR 91.167(a)(3)" },
];

export type EnduranceRow = (typeof RESERVES)[number] & { answer: EngineAnswer<"endurance"> };

/** Each reserve's endurance, every figure the engine's endurance rule
 *  from the airplane's own usable fuel and cruise burn; none without
 *  either, never a stock airplane's (decision 0011). */
export function enduranceRows(usableGal: number | null, burnGph: number | null): EnduranceRow[] | null {
  if (usableGal == null || burnGph == null) return null;
  const rows = RESERVES.map((r) => ({
    ...r,
    answer: callEngine("endurance", { usable_gal: usableGal, burn_gph: burnGph, reserve: r.reserve }),
  }));
  return rows.some((r) => r.answer.minutes == null) ? null : rows;
}
