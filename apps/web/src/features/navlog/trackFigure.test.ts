import { describe, expect, it } from "vitest";
import { trackFigure } from "./trackFigure";

const west = () => -3; // Wisconsin's variation, 3 degrees west
const fix = (headingDeg: number | null) => ({ lat: 43, lon: -89, headingDeg });

describe("trackFigure", () => {
  it("is a dash with no position, no course or not at flying speed", () => {
    expect(trackFigure(null, true, west).value).toBe("—");
    expect(trackFigure(fix(null), true, west).value).toBe("—");
    expect(trackFigure(fix(Number.NaN), true, west).value).toBe("—");
    expect(trackFigure(fix(274), false, west).value).toBe("—");
  });

  it("takes the variation off the GPS's true course: west is best", () => {
    expect(trackFigure(fix(271), true, west).value).toBe("274°");
    expect(trackFigure(fix(271), true, () => 5).value).toBe("266°");
  });

  it("writes three figures and north as 360", () => {
    expect(trackFigure(fix(7), true, () => 3).value).toBe("004°");
    expect(trackFigure(fix(3), true, () => 3).value).toBe("360°");
    expect(trackFigure(fix(358), true, west).value).toBe("001°");
  });

  it("is named Track and said in magnetic degrees digit by digit", () => {
    expect(trackFigure(fix(271), true, west)).toMatchObject({
      name: "Track",
      testId: "strip-track",
      said: "Track, magnetic, 2 7 4 degrees",
    });
  });
});
