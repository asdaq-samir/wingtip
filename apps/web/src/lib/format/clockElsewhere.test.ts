import { describe, expect, it } from "vitest";
import { clockElsewhere } from "./time";

describe("clockElsewhere", () => {
  const at = new Date("2026-11-20T23:24:00Z");
  it("says a field's own time and zone where it keeps another than the departure", () => {
    expect(clockElsewhere(at, "America/Denver", "America/Chicago")).toEqual({ time: "16:24", zone: "MST" });
  });
  it("says nothing where the field keeps the departure's time, whatever this device keeps", () => {
    expect(clockElsewhere(at, "America/Chicago", "America/Chicago")).toBeNull();
    expect(clockElsewhere(at, "America/Indiana/Knox", "America/Chicago")).toBeNull();
  });
  it("takes this device's zone for a departure with none, as My Location", () => {
    // On UTC, as CI's runners and the test image keep.
    expect(clockElsewhere(at, "Etc/UTC", null)).toBeNull();
    expect(clockElsewhere(at, "America/Denver", null)).toEqual({ time: "16:24", zone: "MST" });
  });
  it("says nothing where the field's zone is not known", () => {
    expect(clockElsewhere(at, null, "America/Chicago")).toBeNull();
    expect(clockElsewhere(at, "Not/AZone", "America/Chicago")).toBeNull();
  });
});
