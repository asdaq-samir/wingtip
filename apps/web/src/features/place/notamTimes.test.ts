import { describe, expect, it } from "vitest";
import type { FieldNotam, NotamReading } from "./fieldNotams";
import { span, timeLines } from "./notamTimes";

const read = { estimated: false, permanent: false, starts: null, ends: null } as unknown as NotamReading;
const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("a NOTAM's times, a line each, as ForeFlight's list gives them", () => {
  it("writes how long as 5m, 5h45m, 4d16h and 18d", () => {
    expect(span(5 * 60_000)).toBe("5m");
    expect(span((5 * 60 + 45) * 60_000)).toBe("5h45m");
    expect(span((4 * 24 + 16) * 3_600_000)).toBe("4d16h");
    expect(span(18 * 24 * 3_600_000 + 7 * 3_600_000)).toBe("18d");
  });

  it("gives one in force since its start, and its end with how long is left, in the field's time named by its zone", () => {
    const n = { in_force: true, starts: "2026-11-10T12:00:00Z", ends: "2026-11-12T14:32:00Z" } as FieldNotam;
    // Oshkosh in November keeps Central Standard Time, UTC-6: no "local",
    // no Z time beside it (the owner, 2026-11-23).
    expect(timeLines(n, read, false, "America/Chicago", NOW)).toEqual([
      { label: "Since", value: "11/10 06:00 CST" },
      { label: "Ends", value: "11/12 08:32 CST", soon: "in 1d2h" },
    ]);
  });

  it("reads each field's clock in its own zone, and says UTC where the zone is not known", () => {
    const n = { in_force: true, starts: null, ends: "2026-11-12T03:00:00Z" } as FieldNotam;
    // Phoenix keeps no daylight saving time (UTC-7); the UTC day is the next.
    expect(timeLines(n, read, false, "America/Phoenix", NOW)[0]!.value).toBe("11/11 20:00 MST");
    expect(timeLines(n, read, false, "Pacific/Honolulu", NOW)[0]!.value).toBe("11/11 17:00 HST");
    // Never the device's own time called the field's.
    expect(timeLines(n, read, false, null, NOW)[0]!.value).toBe("11/12 03:00 UTC");
    expect(timeLines(n, read, false, "Not/A_Zone", NOW)[0]!.value).toBe("11/12 03:00 UTC");
  });

  it("gives one to come how soon it starts and how long it lasts, an EST end said as its time alone", () => {
    const n = { in_force: false, starts: "2026-11-11T17:45:00Z", ends: "2026-11-11T23:45:00Z" } as FieldNotam;
    const lines = timeLines(n, { ...read, estimated: true }, false, "America/Chicago", NOW);
    expect(lines).toEqual([
      { label: "Starts", value: "11/11 11:45 CST", soon: "in 5h45m" },
      { label: "Ends", value: "11/11 17:45 CST", soon: "in 11h45m" },
      { label: "Duration", value: "6h00m" },
    ]);
  });

  it("says a permanent one's end as Permanent, a PERM end or the engine's until_charts", () => {
    const perm = { in_force: true, starts: null, ends: null } as FieldNotam;
    expect(timeLines(perm, { ...read, permanent: true }, false, "America/Chicago", NOW)).toEqual([{ label: "Ends", value: "Permanent" }]);
    // FDC 6/3373 at KARR, read on 2026-11-23: PERMANENTLY CLSD, its end EST.
    const fdc = { in_force: true, starts: "2026-05-27T18:43:00Z", ends: "2028-05-27T18:43:00Z" } as FieldNotam;
    const at = Date.parse("2026-11-23T12:00:00Z");
    expect(timeLines(fdc, { ...read, estimated: true }, true, "America/Chicago", at)).toEqual([
      { label: "Since", value: "05/27/26 13:43 CDT" },
      { label: "Ends", value: "Permanent" },
    ]);
  });

  it("says the year on both lines where either is not this year's, as FDC 6/3373's end two years on", () => {
    const n = { in_force: true, starts: "2026-05-27T18:43:00Z", ends: "2028-05-27T18:43:00Z" } as FieldNotam;
    const at = Date.parse("2026-11-23T12:00:00Z");
    expect(timeLines(n, { ...read, estimated: true }, false, "America/Chicago", at)).toEqual([
      { label: "Since", value: "05/27/26 13:43 CDT" },
      { label: "Ends", value: "05/27/28 13:43 CDT", soon: "in 551d" },
    ]);
    expect(timeLines(n, read, false, null, at)[1]!.value).toBe("05/27/28 18:43 UTC");
  });
});
