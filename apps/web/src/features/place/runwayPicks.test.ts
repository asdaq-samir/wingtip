import { describe, expect, it } from "vitest";
import { longestOpen, withNotamClosures } from "./runwayPicks";
import type { NotamMark } from "./notamBadges";

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

describe("withNotamClosures", () => {
  it("closes a runway a NOTAM shuts and leaves one under a caution open", () => {
    const runways = [
      { ends: "05/23", closed: false },
      { ends: "09/27", closed: false },
      { ends: "18/36", closed: true },
    ];
    const mark = (severity: NotamMark["severity"]) => ({ word: "", severity, label: "", notams: [] }) as unknown as NotamMark;
    const runway = new Map([
      [0, mark("unusable")],
      [1, mark("caution")],
    ]);
    const got = withNotamClosures(runways, { runway });
    expect(got.map((r) => r.closed)).toEqual([true, false, true]);
    // Closed for good only where the FAA's data has it so (AC 150/5340-1M
    // 5.6's Xs every 1,000 ft); a NOTAM's closure is not.
    expect(got.map((r) => r.closedForGood)).toEqual([false, false, true]);
  });
});
