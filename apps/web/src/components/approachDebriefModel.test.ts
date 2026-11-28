import { describe, expect, test } from "vitest";
import { withMinimums, type ApproachDebrief } from "./approachDebriefModel";

// Finding the approach and its transition is the planner's (POST
// /api/approach/debriefs, services/planner/tests/test_approach_teaching_api.py)
// and the engine's, each boundary tested there (engine/facade/tests/approach/
// debrief_cases.rs, on the same KBUR drawings). Here, the one rule the page
// asks of its own engine as the pilot types: the minimums held to the lowest
// before the MAP and to how the approach ended (14 CFR 91.175(c) and (e)).

/** KBUR's ILS Y RWY 08 flown down its glide slope to the runway's 787 ft,
 *  as the planner debriefs it, cut to what withMinimums reads. */
const flown = (kind: ApproachDebrief["outcome"]["kind"], lowestFt: number) =>
  ({ findings: [], lowestFt, outcome: { kind, secondsAfterMap: kind === "missed" ? 3 : null } }) as unknown as ApproachDebrief;

describe("the pilot's minimums", () => {
  test("under them before a missed approach is flagged; typed lower, at or above them", () => {
    const d = flown("missed", 787);
    expect(withMinimums(d, 1000).findings.find((f) => f.text.startsWith("Down to"))?.tone).toBe("stop");
    expect(withMinimums(d, 700).findings.filter((f) => f.minimums)).toEqual([
      { tone: "ok", text: "Lowest before the MAP: 787 ft, at or above 700", minimums: true },
    ]);
  });

  test("under them to land is what 91.175(c) allows with the runway in sight, not a fault", () => {
    expect(withMinimums(flown("landed", 727), 1000).findings.find((f) => f.minimums)).toEqual({
      tone: "info",
      text: "Below 1,000 to land: 91.175(c) asks for the runway in sight there",
      minimums: true,
    });
  });
});
