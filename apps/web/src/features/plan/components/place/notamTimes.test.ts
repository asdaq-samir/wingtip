import { describe, expect, it } from "vitest";
import type { FieldNotam, NotamReading } from "./fieldNotams";
import { span, timeLines } from "./notamTimes";

const read = { estimated: false, permanent: false, starts: null, ends: null } as unknown as NotamReading;
const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("a NOTAM's times, as ForeFlight's list gives them", () => {
  it("writes how long as 5h45m, 4d16h and 18d", () => {
    expect(span((5 * 60 + 45) * 60_000)).toBe("5h45m");
    expect(span((4 * 24 + 16) * 3_600_000)).toBe("4d16h");
    expect(span(18 * 24 * 3_600_000 + 7 * 3_600_000)).toBe("18d");
  });

  it("gives one in force since its start, and its end with how long is left", () => {
    const n = { in_force: true, starts: "2026-11-10T12:00:00Z", ends: "2026-11-12T14:32:00Z" } as FieldNotam;
    const lines = timeLines(n, read, NOW);
    expect(lines.map((l) => l.label)).toEqual(["Since", "Ends"]);
    expect(lines[0]!.value).toMatch(/^11\/1[01] \d\d:\d\d$/);
    expect(lines[1]!.value).toMatch(/^11\/12 \d\d:\d\d local \(in 1d2h\)$/);
  });

  it("gives one to come how soon it starts and how long it lasts, an estimate and PERM said (JO 7930.2 4-2-1)", () => {
    const n = { in_force: false, starts: "2026-11-11T17:45:00Z", ends: "2026-11-11T23:45:00Z" } as FieldNotam;
    const lines = timeLines(n, { ...read, estimated: true }, NOW);
    expect(lines.map((l) => l.label)).toEqual(["Starts", "Ends", "Duration"]);
    expect(lines[0]!.value).toMatch(/\(in 5h45m\)$/);
    expect(lines[1]!.value).toMatch(/local \(est\.\) \(in 11h45m\)$/);
    expect(lines[2]!.value).toBe("6h00m");
    expect(timeLines({ ...n, in_force: true, starts: null, ends: null }, { ...read, permanent: true }, NOW)).toEqual([
      { label: "Ends", value: "Permanent" },
    ]);
  });
});
