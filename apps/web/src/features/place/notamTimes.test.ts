import { describe, expect, it } from "vitest";
import type { FieldNotam, NotamReading } from "./fieldNotams";
import { cardTimes, span, timeLines } from "./notamTimes";

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
    expect(lines[0]!.value).toBe("11/10 06:00 local (1200Z)");
    expect(lines[1]!.value).toBe("11/12 08:32 local (1432Z) · in 1d2h");
  });

  it("reads each field's clock in its own zone, and says UTC alone where the zone is not known", () => {
    const n = { in_force: true, starts: null, ends: "2026-11-12T03:00:00Z" } as FieldNotam;
    // Phoenix keeps no daylight saving time (UTC-7); the UTC day is the next.
    expect(timeLines(n, read, "America/Phoenix", NOW)[0]!.value).toBe("11/11 20:00 local (0300Z) · in 15h00m");
    expect(timeLines(n, read, "Pacific/Honolulu", NOW)[0]!.value).toBe("11/11 17:00 local (0300Z) · in 15h00m");
    // Never the device's own time called the field's.
    expect(timeLines(n, read, null, NOW)[0]!.value).toBe("11/12 0300Z · in 15h00m");
    expect(timeLines(n, read, "Not/A_Zone", NOW)[0]!.value).toBe("11/12 0300Z · in 15h00m");
  });

  it("gives one to come how soon it starts and how long it lasts, an estimate and PERM said (JO 7930.2 4-2-1)", () => {
    const n = { in_force: false, starts: "2026-11-11T17:45:00Z", ends: "2026-11-11T23:45:00Z" } as FieldNotam;
    const lines = timeLines(n, { ...read, estimated: true }, "America/Chicago", NOW);
    expect(lines.map((l) => l.label)).toEqual(["Starts", "Ends", "Duration"]);
    expect(lines[0]!.value).toMatch(/ · in 5h45m$/);
    expect(lines[1]!.value).toBe("11/11 17:45 local (2345Z), estimated · in 11h45m");
    expect(lines[2]!.value).toBe("6h00m");
    expect(timeLines({ ...n, in_force: true, starts: null, ends: null }, { ...read, permanent: true }, "America/Chicago", NOW)).toEqual([
      { label: "Ends", value: "Permanent" },
    ]);
  });

  it("says the year on both lines where either is not this year's, as FDC 6/3373 ends two years on", () => {
    // !FDC 6/3373 ARR SID AURORA MUNI ... 2605271843-2805271843EST, read
    // on 2026-11-23: an estimated end (JO 7930.2 4-2-1), 551 days on.
    const n = { in_force: true, starts: "2026-05-27T18:43:00Z", ends: "2028-05-27T18:43:00Z" } as FieldNotam;
    const at = Date.parse("2026-11-23T12:00:00Z");
    const lines = timeLines(n, { ...read, estimated: true }, "America/Chicago", at);
    expect(lines).toEqual([
      { label: "Since", value: "05/27/26 13:43 local (1843Z)" },
      { label: "Ends", value: "05/27/28 13:43 local (1843Z), estimated · in 551d" },
    ]);
    expect(timeLines(n, read, null, at)[1]!.value).toBe("05/27/28 1843Z · in 551d");
  });
});

describe("a NOTAM's times on its own card, in words", () => {
  // FDC 6/3373 at KARR, read on 2026-11-23 (the owner's iPhone).
  const n = { in_force: true, starts: "2026-05-27T18:43:00Z", ends: "2028-05-27T18:43:00Z" } as FieldNotam;
  const at = Date.parse("2026-11-23T12:00:00Z");

  it("says a permanent condition stays until the charts are updated, its EST end the estimate", () => {
    expect(cardTimes(n, { ...read, estimated: true }, true, "America/Chicago", at)).toEqual([
      "In effect since 27 May 2026, 13:43 CDT",
      "Until charts are updated (est. 27 May 2028)",
    ]);
  });

  it("says another end with its year where it is not this year's, estimated where EST says so, in UTC where the zone is unknown", () => {
    expect(cardTimes(n, { ...read, estimated: true }, false, "America/Chicago", at)[1]).toBe(
      "Until 27 May 2028, 13:43 CDT, estimated · in 551d",
    );
    const soon = { in_force: false, starts: "2026-11-23T17:45:00Z", ends: "2026-11-23T23:45:00Z" } as FieldNotam;
    expect(cardTimes(soon, read, false, null, at)).toEqual(["Starts 23 Nov, 1745Z · in 5h45m", "Until 23 Nov, 2345Z · in 11h45m"]);
  });
});
