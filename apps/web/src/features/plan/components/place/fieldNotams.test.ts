import { describe, expect, it } from "vitest";
import { localWords, whenWords, zulu } from "./fieldNotams";

describe("a field's NOTAMs on its card", () => {
  it("says its times in UTC with the day, a feed time with no zone read as UTC (AIM 5-1-3)", () => {
    expect(zulu("2026-11-12T14:32:00Z")).toBe("Nov 12 1432Z");
    expect(zulu("2026-11-12T14:32:00")).toBe("Nov 12 1432Z");
    expect(whenWords({ in_force: true, starts: null, ends: "2026-11-12T14:32:00Z" })).toBe("In effect now, until Nov 12 1432Z");
    expect(whenWords({ in_force: false, starts: "2026-11-12T12:00:00Z", ends: null })).toBe("From Nov 12 1200Z");
    expect(whenWords({ in_force: null, starts: null, ends: null })).toBeNull();
  });

  it("says an estimated end and a permanent one as the engine reads them (JO 7930.2 4-2-1: EST, PERM)", () => {
    const est = { estimated: true, permanent: false };
    expect(whenWords({ in_force: true, starts: null, ends: "2026-11-12T14:32:00Z" }, est)).toBe(
      "In effect now, until Nov 12 1432Z (estimated)",
    );
    const perm = { estimated: false, permanent: true };
    expect(whenWords({ in_force: false, starts: "2026-11-12T12:00:00Z", ends: null }, perm)).toBe("From Nov 12 1200Z, permanent");
    expect(whenWords({ in_force: false, starts: "2026-11-12T12:00:00Z", ends: "2026-11-12T14:32:00Z" })).toBe(
      "From Nov 12 1200Z until Nov 12 1432Z",
    );
  });

  it("gives the window in the device's own time, or nothing with no times", () => {
    expect(localWords(null, null)).toBeNull();
    expect(localWords("2026-11-12T12:00:00Z", null)).toMatch(/^From /);
    expect(localWords(null, "2026-11-12T14:32:00Z")).toMatch(/^Until /);
  });
});
