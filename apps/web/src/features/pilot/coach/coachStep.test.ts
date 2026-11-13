import { describe, expect, it } from "vitest";
import { coachStep } from "./coachStep";
import type { ProficiencyPlan } from "./coachApi";

const plan = (n: number) => ({ sessions: Array.from({ length: n }, () => ({})) }) as unknown as ProficiencyPlan;

describe("coachStep", () => {
  it("says each step in turn", () => {
    expect(coachStep({ ready: false, making: false, plan: null })).toBe("Reading your logbook…");
    expect(coachStep({ ready: true, making: true, plan: null })).toMatch(/debriefs/);
    expect(coachStep({ ready: true, making: false, plan: plan(1) })).toBe("Plan made: 1 session.");
    expect(coachStep({ ready: true, making: false, plan: plan(2) })).toBe("Plan made: 2 sessions.");
  });
  it("says nothing before the pilot asks", () => {
    expect(coachStep({ ready: true, making: false, plan: null })).toBe("");
  });
});
