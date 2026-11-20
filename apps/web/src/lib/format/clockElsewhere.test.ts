import { describe, expect, it } from "vitest";
import { clockElsewhere } from "./time";

describe("clockElsewhere", () => {
  const at = new Date("2026-11-20T23:24:00Z");
  it("says a field's own time and zone where it keeps another", () => {
    // On UTC, as CI's runners and the test image keep; Denver seven hours behind in November.
    expect(clockElsewhere(at, "America/Denver")).toEqual({ time: "16:24", zone: "MST" });
  });
  it("says nothing where the field keeps this device's time, or its zone is not known", () => {
    expect(clockElsewhere(at, "Etc/UTC")).toBeNull();
    expect(clockElsewhere(at, null)).toBeNull();
    expect(clockElsewhere(at, "Not/AZone")).toBeNull();
  });
});
