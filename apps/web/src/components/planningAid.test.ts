import { describe, expect, it } from "vitest";
import { WORDING } from "../lib/wording/generated/wording";
import { PLANNING_AID } from "./planningAid";

// The planning aid's words are design/wording.json's, the same on all
// three apps (docs/design/rules.md, section 18).
describe("the planning aid", () => {
  it("is WORDING's words, in About and the briefing's foot", () => {
    expect(PLANNING_AID).toBe(WORDING.planningAid);
  });

  it("keeps Flight Service's number on one line (non-breaking hyphens)", () => {
    expect(PLANNING_AID).toContain("1‑800‑WX‑BRIEF");
  });
});
