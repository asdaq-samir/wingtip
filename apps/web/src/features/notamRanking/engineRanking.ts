/**
 * The NOTAMs that matter with no words from the assistant: the engine's
 * own ranking (the planner's POST /api/notams/ranked, notams_ranked) put
 * in the shape the section draws, each line the engine's reasons, as the
 * assistant itself writes a line where the model wrote none
 * (services/assistant app/notam_rank.py engine_line). This is what the
 * Brief shows while the deployment keeps Claude off (lib/subscription):
 * the owner, 2026-11-10, "To keep the cost low, we only add the claude
 * feature later when we decide about subscription model."
 */
import type { components } from "../../lib/api/schema";
import type { RankedNotams } from "../../lib/api/types";

export type EngineRanked = components["schemas"]["NotamsRanked"];

/** The engine's ranking as the section's answer, no line worded. */
export function engineRanking(found: EngineRanked): RankedNotams {
  return {
    notams: (found.notams ?? []).map((n, k) => {
      const reasons = (n.reasons ?? []).map((r) => r.words ?? "");
      return {
        id: n.id,
        kind: n.kind ?? "notam",
        label: `${n.kind === "tfr" ? "TFR" : "NOTAM"} ${n.id}`,
        why: `${reasons.join("; ")}.`,
        worded: false,
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
    model: "",
    unavailable: null,
  };
}
