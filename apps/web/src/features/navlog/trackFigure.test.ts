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

  it("not at flying speed, is the leg's planned magnetic course, named Course, a dash with no route either", () => {
    expect(trackFigure(fix(271), false, west, 274)).toMatchObject({
      name: "Course",
      value: "274°",
      said: "Course, magnetic, 2 7 4 degrees",
    });
    expect(trackFigure(null, false, west, 360).value).toBe("360°");
    expect(trackFigure(null, false, west, null).value).toBe("—");
    // Moving, the GPS's track whatever the plan says.
    expect(trackFigure(fix(271), true, west, 100)).toMatchObject({ name: "Track", value: "274°" });
  });
});
