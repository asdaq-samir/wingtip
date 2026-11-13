/**
 * The NOTAMs that matter: the engine's own ranking (the planner's POST
 * /api/notams/ranked, notams_ranked) put in the shape the section draws,
 * each NOTAM's line the engine's reasons for it.
 */
import type { components } from "../../lib/api/schema";

export type EngineRanked = components["schemas"]["NotamsRanked"];
type EngineNotam = EngineRanked["notams"][number];

/** One NOTAM as the section draws it: the engine's, named and with its
 *  line, and its place in the ranking. */
export interface RankedNotam {
  id: string;
  kind: string;
  /** "NOTAM 1/2345", "TFR FDC 6/7890". */
  label: string;
  /** Why it bears on the flight: the engine's reasons, as one line. */
  why: string;
  top: boolean;
  /** 1 for the first. */
  rank: number;
  score: number;
  tied: boolean;
  field: string | null;
  in_force: boolean | null;
  reasons: string[];
  /** As the FAA sent it. */
  raw: string;
  starts: string | null;
  ends: string | null;
}

/** The ranking for the flight, as the section draws it. */
export interface RankedNotams {
  notams: RankedNotam[];
  top: number;
  /** The day (ISO date) the planner first heard the FAA's NOTAM feed. */
  coverage_since: string | null;
  /** What could not be checked just now ("tfrs"). */
  unchecked: string[];
}

/** The engine's ranking as the section's answer. */
export function engineRanking(found: EngineRanked): RankedNotams {
  return {
    notams: (found.notams ?? []).map((n: EngineNotam, k) => {
      const reasons = (n.reasons ?? []).map((r) => r.words ?? "");
      return {
        id: n.id,
        kind: n.kind ?? "notam",
        label: `${n.kind === "tfr" ? "TFR" : "NOTAM"} ${n.id}`,
        why: `${reasons.join("; ")}.`,
        top: !!n.top,
        rank: k + 1,
        score: n.score ?? 0,
        tied: !!n.tied,
        field: n.field ?? null,
        in_force: n.in_force ?? null,
        reasons,
        raw: n.raw ?? "",
        starts: n.starts ?? null,
        ends: n.ends ?? null,
      };
    }),
    top: found.top ?? 0,
    coverage_since: found.coverage_since ?? null,
    unchecked: found.unchecked ?? [],
  };
}
