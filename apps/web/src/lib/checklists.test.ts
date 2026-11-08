import { describe, expect, it } from "vitest";
import { CHECKLIST_PHASES, checklistText, phasesText, withChecklist } from "./checklists";
import { checklistOf } from "./checklist";

describe("an airplane's checklists, kept on the device", () => {
  it("start empty, and are kept per airplane and per list", () => {
    expect(checklistText({}, "mine:5", "normal")).toBe("");
    let kept = withChecklist({}, "mine:5", "normal", "# Before takeoff\nMixture -- Rich");
    kept = withChecklist(kept, "mine:5", "emergency", "# Engine fire in flight\nMixture -- Idle cutoff");
    kept = withChecklist(kept, "profile:c172", "normal", "# Cruise\nMixture -- Lean");
    expect(checklistText(kept, "mine:5", "normal")).toBe("# Before takeoff\nMixture -- Rich");
    expect(checklistText(kept, "mine:5", "emergency")).toContain("Engine fire");
    expect(checklistText(kept, "profile:c172", "emergency")).toBe("");
  });

  it("forget a list written blank, and an airplane with none left", () => {
    let kept = withChecklist({}, "tail:N12345", "normal", "# Cruise\nMixture -- Lean");
    kept = withChecklist(kept, "tail:N12345", "normal", "  \n");
    expect(kept).toEqual({});
  });
});

describe("the phases a list starts from", () => {
  it("are the handbook's sections in order, headings and nothing under them", () => {
    expect(CHECKLIST_PHASES.normal[0]).toBe("Preflight inspection");
    expect(CHECKLIST_PHASES.normal.at(-1)).toBe("Securing the airplane");
    expect(CHECKLIST_PHASES.emergency).toHaveLength(12);
    const text = phasesText("emergency");
    expect(text.split("\n").filter(Boolean).every(line => line.startsWith("# "))).toBe(true);
    // Read, headings alone are no checklist: nothing is run until written.
    expect(checklistOf(text).sections).toEqual([]);
  });
});
