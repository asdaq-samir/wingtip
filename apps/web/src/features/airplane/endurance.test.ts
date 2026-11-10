import { describe, expect, it } from "vitest";
import { enduranceRows } from "./endurance";

describe("an airplane's endurance on its profile", () => {
  it("is the engine's, to dry tanks and after each reserve (14 CFR 91.151(a), 91.167(a)(3))", () => {
    const rows = enduranceRows(40, 8)!;
    expect(rows.map((r) => r.reserve)).toEqual(["none", "vfr_day", "vfr_night", "ifr"]);
    expect(rows[0]!.answer.minutes).toBe(300);
    expect(rows[1]!.answer.after_reserve_min).toBe(270);
    expect(rows[3]!.answer.after_reserve_min).toBe(255);
  });

  it("assumes nothing without the airplane's own usable fuel or burn", () => {
    expect(enduranceRows(null, 8)).toBeNull();
    expect(enduranceRows(40, null)).toBeNull();
  });
});
