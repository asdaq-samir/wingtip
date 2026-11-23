import { describe, expect, it } from "vitest";
import { callTypes, entryRules, specialVfr } from "./airspaceRules";

// Each class's rules and cites, and 14 CFR 91.157 on both sides of each
// line, are the engine's, tested there (engine/facade/tests/wording.rs's
// entry rules, special_vfr.rs over the shared fixtures/specialVfr.json):
// here, that the card's class reaches the engine and its answer is read back.
describe("airspaceRules", () => {
  it("reads each rule with its section", () => {
    expect(entryRules("B")[0]).toEqual({ rule: "An ATC clearance before you enter", cite: "14 CFR 91.131(a)(1)" });
  });

  it("reads the frequencies to call", () => {
    expect(callTypes("D")).toEqual(["TWR"]);
  });

  it("offers a surface area's special VFR, and none at an appendix D airport", () => {
    expect(specialVfr("D", "DPA").available).toBe(true);
    expect(specialVfr("D", "DPA").lines[0]).toEqual({ words: "An ATC clearance", source: "14 CFR 91.157(b)(1)" });
    const ohare = specialVfr("B", "ORD");
    expect(ohare.available).toBe(false);
    expect(ohare.lines.map((l) => l.source)).toEqual(["14 CFR 91.157(a); part 91 appendix D, section 3"]);
  });
});
