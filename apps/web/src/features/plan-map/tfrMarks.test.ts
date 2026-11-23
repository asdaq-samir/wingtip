import { describe, expect, it } from "vitest";
import type { Tfr } from "../../lib/api/types";
import { inForce } from "./tfrMarks";

const tfr = (effective: string | null, expires: string | null) => ({ effective, expires }) as Tfr;

describe("inForce", () => {
  const now = Date.UTC(2026, 10, 21, 15, 0);

  it("is in force between its times, and with none", () => {
    expect(inForce(tfr("2026-11-21T14:00:00Z", "2026-11-21T16:00:00Z"), now)).toBe(true);
    expect(inForce(tfr("2026-11-21T16:00:00Z", null), now)).toBe(false);
    expect(inForce(tfr(null, null), now)).toBe(true);
  });

  it("reads a time with no zone as UTC, and one that does not read as no bound", () => {
    // 14:00 with no zone is 14:00Z, not this device's 14:00.
    expect(inForce(tfr("2026-11-21T14:00:00", "2026-11-21T15:30:00"), now)).toBe(true);
    // An unreadable end was NaN, every comparison false: drawn as not in force.
    expect(inForce(tfr("2026-11-21T14:00:00Z", "until further notice"), now)).toBe(true);
  });
});
