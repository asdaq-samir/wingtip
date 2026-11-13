import { describe, expect, it } from "vitest";
import type { FieldNotam, NotamReading } from "./fieldNotams";
import { span, timeLines } from "./notamTimes";

const read = { estimated: false, permanent: false, starts: null, ends: null } as unknown as NotamReading;
const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("a NOTAM's times, as ForeFlight's list gives them", () => {
  it("writes how long as 5m, 5h45m, 4d16h and 18d", () => {
    expect(span(5 * 60_000)).toBe("5m");
    expect(span((5 * 60 + 45) * 60_000)).toBe("5h45m");
    expect(span((4 * 24 + 16) * 3_600_000)).toBe("4d16h");
    expect(span(18 * 24 * 3_600_000 + 7 * 3_600_000)).toBe("18d");
  });

  it("gives one in force since its start, and its end with how long is left, in the field's time with UTC beside", () => {
    const n = { in_force: true, starts: "2026-11-10T12:00:00Z", ends: "2026-11-12T14:32:00Z" } as FieldNotam;
    // Oshkosh in November keeps Central Standard Time, UTC-6.
    const lines = timeLines(n, read, "America/Chicago", NOW);
    expect(lines.map((l) => l.label)).toEqual(["Since", "Ends"]);
    expect(lines[0]!.value).toBe("11/10 06:00 (1200Z)");
    expect(lines[1]!.value).toBe("11/12 08:32 local (1432Z) (in 1d2h)");
  });

  it("reads each field's clock in its own zone, and says UTC alone where the zone is not known", () => {
    const n = { in_force: true, starts: null, ends: "2026-11-12T03:00:00Z" } as FieldNotam;
    // Phoenix keeps no daylight saving time (UTC-7); the UTC day is the next.
    expect(timeLines(n, read, "America/Phoenix", NOW)[0]!.value).toBe("11/11 20:00 local (0300Z) (in 15h00m)");
    expect(timeLines(n, read, "Pacific/Honolulu", NOW)[0]!.value).toBe("11/11 17:00 local (0300Z) (in 15h00m)");
    // Never the device's own time called the field's.
    expect(timeLines(n, read, null, NOW)[0]!.value).toBe("11/12 0300Z (in 15h00m)");
    expect(timeLines(n, read, "Not/A_Zone", NOW)[0]!.value).toBe("11/12 0300Z (in 15h00m)");
  });

  it("gives one to come how soon it starts and how long it lasts, an estimate and PERM said (JO 7930.2 4-2-1)", () => {
    const n = { in_force: false, starts: "2026-11-11T17:45:00Z", ends: "2026-11-11T23:45:00Z" } as FieldNotam;
    const lines = timeLines(n, { ...read, estimated: true }, "America/Chicago", NOW);
    expect(lines.map((l) => l.label)).toEqual(["Starts", "Ends", "Duration"]);
    expect(lines[0]!.value).toMatch(/\(in 5h45m\)$/);
    expect(lines[1]!.value).toBe("11/11 17:45 local (2345Z) (est.) (in 11h45m)");
    expect(lines[2]!.value).toBe("6h00m");
    expect(timeLines({ ...n, in_force: true, starts: null, ends: null }, { ...read, permanent: true }, "America/Chicago", NOW)).toEqual([
      { label: "Ends", value: "Permanent" },
    ]);
  });
});
