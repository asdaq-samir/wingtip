import { describe, expect, it } from "vitest";
import { fieldAlerts, whenWords, zulu, type FieldNotam, type FieldNotams } from "./fieldNotams";

const notam = (id: string, extra: Partial<FieldNotam>): FieldNotam =>
  ({
    id,
    kind: "notam",
    closed: false,
    raw: `!MSN ${id}`,
    rank: 0,
    score: 0,
    top: false,
    tied: false,
    reasons: [],
    runways: [],
    ...extra,
  }) as FieldNotam;

describe("a field's NOTAMs on its card", () => {
  it("leads with closures and TFRs, in the engine's order, at most three", () => {
    const answer = {
      notams: [
        notam("a", {}),
        notam("b", { closed: true }),
        notam("c", { kind: "tfr" }),
        notam("d", { closed: true }),
        notam("e", { kind: "tfr" }),
      ],
      top: 0,
      unchecked: [],
      coverage_since: null,
    } as FieldNotams;
    expect(fieldAlerts(answer).map((n) => n.id)).toEqual(["b", "c", "d"]);
    expect(fieldAlerts(undefined)).toEqual([]);
  });

  it("says its times in UTC with the day, a feed time with no zone read as UTC (AIM 5-1-3)", () => {
    expect(zulu("2026-11-12T14:32:00Z")).toBe("Nov 12 1432Z");
    expect(zulu("2026-11-12T14:32:00")).toBe("Nov 12 1432Z");
    expect(whenWords({ in_force: true, starts: null, ends: "2026-11-12T14:32:00Z" })).toBe("In effect now, until Nov 12 1432Z");
    expect(whenWords({ in_force: false, starts: "2026-11-12T12:00:00Z", ends: null })).toBe("From Nov 12 1200Z");
    expect(whenWords({ in_force: null, starts: null, ends: null })).toBeNull();
  });
});
