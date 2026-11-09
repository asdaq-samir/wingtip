import { describe, expect, test } from "vitest";
import type { RunwayRvr } from "./api/types";
import { readingWords, rvrRows, smWords } from "./rvrRows";

const end = (runway: string, touchdown: number | null, mid: number | null, rollout: number | null): RunwayRvr => ({
  airport: "KDFW", runway, heard: 0,
  touchdown_ft: touchdown, touchdown_more: touchdown === 6000,
  midpoint_ft: mid, midpoint_more: mid === 6000,
  rollout_ft: rollout, rollout_more: rollout === 6000,
});

describe("an airport's RVR", () => {
  test("6,000 is the system's most and none is a dash", () => {
    expect(readingWords(6000, true)).toBe("6000+");
    expect(readingWords(2400, false)).toBe("2400");
    expect(readingWords(null, false)).toBe("—");
  });

  test("a visibility is said as a minimum is", () => {
    expect([0.5, 1.25, 0.625, 3].map(smWords)).toEqual(["1/2", "1 1/4", "5/8", "3"]);
  });

  test("the engine marks a runway whose lowest reading is under the minimum (91.175(h)(2))", () => {
    // 1/2 SM is 2,400 ft: 2,400 is not under it, 2,200 is.
    const rows = rvrRows([end("13R", 6000, null, 6000), end("31L", 6000, 2400, 6000), end("18L", 2200, 6000, 6000)], 0.5);
    expect(rows.map(r => r.readings)).toEqual(["6000+ · — · 6000+", "6000+ · 2400 · 6000+", "2200 · 6000+ · 6000+"]);
    expect(rows.map(r => r.under)).toEqual([null, null, "Under your 1/2 SM minimum (14 CFR 91.175(h))"]);
  });

  test("a minimum past the table, or none, is not judged", () => {
    expect(rvrRows([end("18L", 1600, null, null)], 3).map(r => r.under)).toEqual([null]);
    expect(rvrRows([end("18L", 1600, null, null)], null).map(r => r.under)).toEqual([null]);
  });
});
