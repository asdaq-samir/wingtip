import { describe, expect, it } from "vitest";
import { modelledWinds, WINDS_MODELLED, WINDS_MODELLED_LABEL } from "./windsAloft";

describe("windsAloft", () => {
  it("names the GFS the same way beside a figure, in a label and in the nav log", () => {
    expect(WINDS_MODELLED).toBe("modelled (GFS)");
    expect(WINDS_MODELLED_LABEL).toBe("Modelled (GFS)");
    expect(modelledWinds()).toBe("modelled winds (GFS)");
    expect(modelledWinds(" 12Z +6 h")).toBe("modelled winds (GFS 12Z +6 h)");
  });
});
