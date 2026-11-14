import { describe, expect, it } from "vitest";
import { longestOpen } from "./runwayPicks";

describe("longestOpen", () => {
  it("is the longest runway open, closed ones and unsurveyed ones left out", () => {
    const runways = [
      { ends: "04L/22R", length_ft: 7500, closed: true },
      { ends: "10/28", length_ft: 6000, closed: false },
      { ends: "14/32", length_ft: null, closed: false },
      { ends: "09/27", length_ft: 4000, closed: false },
    ];
    expect(longestOpen(runways)?.ends).toBe("10/28");
  });

  it("is none where every runway is closed", () => {
    expect(longestOpen([{ length_ft: 5000, closed: true }])).toBeNull();
  });
});
