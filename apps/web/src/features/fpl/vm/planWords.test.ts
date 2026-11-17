import { describe, expect, it } from "vitest";
import type { AltitudeSegment } from "../../../lib/api/types";
import { briefMarkOf, findingRows, marksOf, planningWords, progressWords, tightLegWords } from "./planWords";

describe("the progress toast", () => {
  it("says the planner's step, not its leg or its seconds", () => {
    expect(planningWords("Altitudes C81 → KDLH, 12 s, waiting on the terrain and obstacles…")).toBe("Planning Altitudes…");
    expect(planningWords("Scoring checkpoints")).toBe("Finding Checkpoints…");
    expect(planningWords("Winds")).toBe("Planning…");
  });

  it("says one thing at a time, the nav log's first", () => {
    expect(progressWords(null, null, false)).toBeNull();
    expect(progressWords(null, "course", true)).toBe("Drawing Route…");
    expect(progressWords(null, null, true)).toBe("Fetching Weather…");
    expect(progressWords("Altitudes", "navlog", false)).toBe("Planning Altitudes…");
  });
});

describe("a tight leg", () => {
  const segment = (over: Partial<AltitudeSegment>) =>
    ({
      tight: true,
      candidates_ft: [4400],
      band_ceiling_ft: 4500,
      airspace_ceiling_ft: 4500,
      cloud_ceiling_ft: null,
      floor_ft: 4100,
      from_nm: 12.4,
      to_nm: 30.6,
      ...over,
    }) as unknown as AltitudeSegment;

  it("says where, at what, and the room either side", () => {
    expect(tightLegWords([segment({})])).toBe(
      "Tight 12–31 nm along: 4,400 ft, 100 ft under the Class B and 300 ft over the obstacle minimum.",
    );
    expect(tightLegWords([segment({ airspace_ceiling_ft: null, cloud_ceiling_ft: 4500, floor_ft: 4400 })])).toBe(
      "Tight 12–31 nm along: 4,400 ft, 100 ft under the cloud clearance and right at the obstacle minimum.",
    );
  });

  it("says nothing with no tight leg", () => {
    expect(tightLegWords([segment({ tight: false })])).toBeNull();
    expect(tightLegWords(undefined)).toBeNull();
  });
});

describe("the tabs' marks", () => {
  it("are the worst finding on each tab, and the Brief's the worst of all", () => {
    const marks = marksOf([
      { tab: "depart", finding: "caution" },
      { tab: "depart", finding: "stop" },
      { tab: "enroute", finding: "caution" },
      { tab: "arrive", finding: "ok" as never },
    ]);
    expect(marks).toEqual({ depart: "stop", enroute: "caution" });
    expect(briefMarkOf(marks)).toBe("stop");
    expect(briefMarkOf({ enroute: "caution" })).toBe("caution");
    expect(briefMarkOf({})).toBeNull();
  });
});

describe("FPL's findings under its tiles", () => {
  const item = (key: string, finding: string, detail = `${key} found`) => ({ key, label: key, finding, detail }) as never;

  it("says the ones to act on, red first, each kind in the Brief's order", () => {
    const rows = findingRows([
      item("weather", "caution"),
      item("airspace", "ok"),
      item("fuel", "stop", "6.2 gal short of the fuel and its 45 min reserve (14 CFR 91.151)"),
      item("runways", "unknown"),
      item("risk", "caution"),
      item("balance", "stop"),
    ]);
    expect(rows.map((r) => `${r.key}:${r.finding}`)).toEqual(["fuel:stop", "balance:stop", "weather:caution", "risk:caution"]);
    expect(rows[0]!.detail).toBe("6.2 gal short of the fuel and its 45 min reserve (14 CFR 91.151)");
  });

  it("says nothing where nothing was found", () => {
    expect(findingRows([item("weather", "ok"), item("runways", "unknown"), item("fuel", "pending")])).toEqual([]);
  });
});
