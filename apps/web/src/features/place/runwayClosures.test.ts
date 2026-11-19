import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/runwayClosureMarks.json";
import { callEngine, type EngineInput } from "../../lib/engine/engine";
import { FT_PER_NM } from "../../lib/geo";
import { closureMarksOf } from "./runwayClosures";

const KEFT = "!EFT 11/003 EFT RWY 02/20 CLSD 2611111352-2611192359";

describe("where a closed runway's crosses go (runway_closure_marks, AC 150/5340-1M 5.6 and 5.7, AIM 2-3-6)", () => {
  it("is the engine's answer to the shared cases", () => {
    for (const c of fixture.cases) {
      expect(callEngine("runway_closure_marks", c.input as EngineInput<"runway_closure_marks">), c.about).toEqual(c.answer);
    }
  });

  it("puts KEFT's Xs at 02/20's ends in the box's points, none where the open 12/30 crosses it", () => {
    // KEFT's runways (the fixture's first case) at 0.05 points a foot, y down.
    const [closed, open] = fixture.cases[0]!.input.runways;
    const scale = FT_PER_NM / 20;
    const at = (p: number[]) => ({ x: p[0]! / 20, y: -p[1]! / 20 });
    const strip = (r: typeof closed, notams: string[]) => {
      const [a, b] = [at(r!.a), at(r!.b)];
      return { ends: r!.ends as [string, string], ax: a.x, ay: a.y, bx: b.x, by: b.y, width: 6, permanent: false, notams };
    };
    const [c, o] = closureMarksOf([strip(closed, [KEFT]), strip(open, [])], scale);
    expect(c!.whole).toBe(true);
    // Each X near its own end: neither where 12/30 crosses, 78% of the
    // way up from 02.
    const [a, b] = [at(closed!.a), at(closed!.b)];
    const along = c!.marks.map(([x, y]) => ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2));
    expect(along).toHaveLength(2);
    expect(along[0]).toBeLessThan(0.05);
    expect(along[1]).toBeGreaterThan(0.95);
    expect(o).toEqual({ whole: false, parts: [], marks: [] });
  });

  it("asks nothing where nothing is closed", () => {
    const open = { ends: ["9", "27"] as [string, string], ax: 0, ay: 0, bx: 100, by: 0, width: 6, permanent: false, notams: [] };
    expect(closureMarksOf([open], 50)).toEqual([{ whole: false, parts: [], marks: [] }]);
  });
});
