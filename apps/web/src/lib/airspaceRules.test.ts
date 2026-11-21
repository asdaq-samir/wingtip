import { describe, expect, it } from "vitest";
import { callTypes, entryRules, specialVfr } from "./airspaceRules";
import { callEngine, type EngineInput } from "./engine/engine";
import fixture from "./fixtures/specialVfr.json";

describe("airspaceRules", () => {
  it("asks a clearance for Class B and radio contact for C and D, each with its section", () => {
    expect(entryRules("B")[0]).toEqual({ rule: "An ATC clearance before you enter", cite: "14 CFR 91.131(a)(1)" });
    expect(entryRules("C")[0]!.cite).toBe("14 CFR 91.130(c)(1)");
    expect(entryRules("D")[0]!.cite).toBe("14 CFR 91.129(c)(1)");
    // No transponder rule of D's own (91.215(b) names A, B and C).
    expect(entryRules("D").some((r) => /transponder/.test(r.rule))).toBe(false);
    // 91.117(b)'s 200 kt is C's and D's; B's is (c) under it.
    expect(entryRules("B").find((r) => /kt/.test(r.rule))!.cite).toBe("14 CFR 91.117(a), (c)");
  });

  it("calls approach for B and C, the tower for D", () => {
    expect(callTypes("B")).toEqual(["APP", "TWR"]);
    expect(callTypes("D")).toEqual(["TWR"]);
  });

  // The shared cases (fixtures/specialVfr.json), which the engine's own
  // test holds it to as well: 14 CFR 91.157 on both sides of each line.
  it.each(fixture.special_vfr)("special VFR: $about", ({ input, answer }) => {
    expect(callEngine("special_vfr", input as unknown as EngineInput<"special_vfr">)).toEqual(answer);
  });

  it("offers a surface area's special VFR, and none at an appendix D airport", () => {
    expect(specialVfr("D", "DPA").available).toBe(true);
    expect(specialVfr("D", "DPA").lines[0]).toEqual({ words: "An ATC clearance", source: "14 CFR 91.157(b)(1)" });
    const ohare = specialVfr("B", "ORD");
    expect(ohare.available).toBe(false);
    expect(ohare.lines.map((l) => l.source)).toEqual(["14 CFR 91.157(a); part 91 appendix D, section 3"]);
  });
});
