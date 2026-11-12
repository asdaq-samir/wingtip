import { describe, expect, it } from "vitest";
import type { StudioDraft } from "./draftsApi";
import { draftDay } from "./useDrafts";

const base: StudioDraft = { id: "x", status: "ready", local_date: "2026-11-08", sources: [] };

describe("draftDay", () => {
  it("is the UTC day of the report nearest the place", () => {
    // 2026-11-09T00:30Z: the evening of the 8th in Kentucky, the 9th in UTC.
    const draft = {
      ...base,
      identity: { verdict: "confirmed", checks: [], nearest: { t: 1794184200, lat: 36.7, lon: -88.6, distance_nm: 1 } },
    } as StudioDraft;
    expect(draftDay(draft)).toBe("2026-11-09");
  });

  it("is the middle of the window without one, and none without a check", () => {
    const draft = { ...base, identity: { verdict: "no_track", checks: [], window: { start: 1794162300, end: 1794166800 } } } as StudioDraft;
    expect(draftDay(draft)).toBe("2026-11-08");
    expect(draftDay(base)).toBeNull();
  });
});
