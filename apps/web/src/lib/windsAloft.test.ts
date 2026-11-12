import { describe, expect, it } from "vitest";
import { modelledWinds, WINDS_MODELLED, WINDS_MODELLED_LABEL, windsSource } from "./windsAloft";

describe("windsAloft", () => {
  it("names the GFS the same way beside a figure, in a label and in the nav log", () => {
    expect(WINDS_MODELLED).toBe("modelled (GFS)");
    expect(WINDS_MODELLED_LABEL).toBe("Modelled (GFS)");
    expect(modelledWinds()).toBe("modelled winds (GFS)");
    expect(modelledWinds(" 12Z +6 h")).toBe("modelled winds (GFS 12Z +6 h)");
  });

  it("names a plan's winds as the planner does, and nothing where it gives no name", () => {
    expect(windsSource({ label: "AWC winds, 12Z" })).toBe("AWC winds, 12Z");
    expect(windsSource({ label: null })).toBeNull();
    expect(windsSource(null)).toBeNull();
  });
});
