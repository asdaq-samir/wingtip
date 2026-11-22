import { describe, expect, test } from "vitest";
import type { Leg } from "../../lib/api/types";
import { passTime, suaWhen, tfrWhen } from "./passTimes";

const legs = [
  { distance_nm: 50, ete_min: 30 },
  { distance_nm: 100, ete_min: 50 },
] as unknown as Leg[];

// The pass's minutes, a TFR's margin and the times of use read are the
// engine's, each case tested there (engine/facade/tests/gonogo/
// pass_times_cases.rs): here, that the legs, the times and the clocks the
// page works out reach it, and the local clock in an area's own zone,
// which the page reads and the engine does not.
describe("when the flight passes a point", () => {
  test("the departure plus the legs' times, the leg it is in pro rata", () => {
    expect(passTime(legs, "2026-10-06T14:00:00Z", 25)!.toISOString()).toBe("2026-10-06T14:15:00.000Z");
    expect(passTime([], "2026-10-06T14:00:00Z", 10)).toBeNull();
    expect(passTime([{ distance_nm: 50, ete_min: null }] as unknown as Leg[], "2026-10-06T14:00:00Z", 10)).toBeNull();
  });

  test("a TFR's window against the pass, half an hour either side", () => {
    const tfr = { effective: "2026-10-06T16:00:00Z", expires: "2026-10-06T18:00:00Z" };
    expect(tfrWhen(tfr, new Date("2026-10-06T15:00:00Z"))).toBe("before");
    expect(tfrWhen({ effective: null, expires: null }, new Date())).toBe("in-force");
  });

  test("a special-use area's published times of use, the pass's UTC day and minute passed", () => {
    const tuesday1420z = new Date("2026-10-06T14:20:00Z"); // a Tuesday
    expect(suaWhen("1400 - 2200Z, MON - FRI", tuesday1420z)).toBe("active");
    expect(suaWhen("1500 - 2200Z, MON - FRI; OTHER TIMES BY NOTAM", tuesday1420z)).toBe("by-notam");
    expect(suaWhen("1400 - 2200Z, SAT - SUN", tuesday1420z)).toBe("not-scheduled");
  });

  test("local hours are read in the area's own zone, daylight saving time and all", () => {
    // 14:20Z on Tuesday 6 October 2026 is 08:20 MDT in Denver, 07:20 MST in
    // Phoenix (Arizona keeps standard time), 10:20 EDT in New York.
    const tuesday1420z = new Date("2026-10-06T14:20:00Z");
    const hours = "0800 - 1700, MON - FRI; OTHER TIMES BY NOTAM";
    expect(suaWhen(hours, tuesday1420z, "America/Denver")).toBe("active");
    expect(suaWhen(hours, tuesday1420z, "America/Phoenix")).toBe("by-notam");
    expect(suaWhen("0700 - 0800 MST, MON - FRI", tuesday1420z, "America/Phoenix")).toBe("active");
    // In January Denver keeps standard time too: 14:20Z is 07:20 there.
    expect(suaWhen(hours, new Date("2027-01-05T14:20:00Z"), "America/Denver")).toBe("by-notam");
    // Hawaii's 17:00 on Monday is Tuesday 03:00Z.
    expect(suaWhen("0800 - 1800, MON", new Date("2026-10-06T03:00:00Z"), "Pacific/Honolulu")).toBe("active");
    // No zone for the area: its local hours are not guessed at.
    expect(suaWhen(hours, tuesday1420z, null)).toBe("unknown");
    expect(suaWhen(hours, tuesday1420z, "Not/AZone")).toBe("unknown");
    // UTC ranges need none.
    expect(suaWhen("1400 - 2200Z, MON - FRI", tuesday1420z, null)).toBe("active");
  });
});
