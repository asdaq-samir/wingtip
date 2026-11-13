import { describe, expect, it } from "vitest";
import { engineRanking, type EngineRanked } from "./engineRanking";

describe("the engine's NOTAM ranking", () => {
  it("keeps the engine's order and top ones, each line its reasons", () => {
    const found = {
      top: 1,
      coverage_since: "2026-11-01",
      unchecked: [],
      notams: [
        {
          id: "1/2345",
          kind: "notam",
          top: true,
          score: 9,
          tied: false,
          raw: "RWY 09/27 CLSD",
          reasons: [{ key: "runway", words: "The runway in use" }],
        },
        { id: "FDC 6/7890", kind: "tfr", top: false, score: 3, tied: false, raw: "TFR", reasons: [] },
      ],
    } as unknown as EngineRanked;
    const answer = engineRanking(found);
    expect(answer.notams.map((n) => [n.label, n.rank, n.top])).toEqual([
      ["NOTAM 1/2345", 1, true],
      ["TFR FDC 6/7890", 2, false],
    ]);
    expect(answer.notams[0]?.why).toBe("The runway in use.");
  });
});
