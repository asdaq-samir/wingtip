import { describe, expect, it } from "vitest";
import type { LogbookEntry } from "../../lib/api/types";
import logbookFixture from "../../lib/fixtures/logbookCsv.json";
import { importLogbook, logbookCsv } from "./logbookCsv";

// Reading CSV, ForeFlight's export and a file with no flights' header are
// the engine's, tested once there (engine/facade/tests/pilot.rs, with this
// fixture): here, the page's own LogbookEntry written and read back
// through it, and the shared cases.
describe("the logbook as CSV", () => {
  it("writes its own, oldest first, and reads it back as it was", () => {
    const entry = (over: Partial<LogbookEntry>): LogbookEntry =>
      ({
        id: 1,
        flownOn: "2026-10-01",
        aircraft: "N12345",
        aircraftType: "C172",
        route: "C81 KDLH",
        totalHours: 3.4,
        nightHours: 0.5,
        crossCountryHours: 3.4,
        dayLandings: 2,
        nightLandings: 1,
        remarks: 'Smooth, then "bumpy"',
        dualHours: 0,
        soloHours: 3.4,
        instrumentHours: 0.3,
        toweredLandings: 1,
        distanceNm: 230,
        longestLegNm: 230,
        approaches: 2,
        holding: true,
        tracking: true,
        airHours: 3.1,
        touchAndGoes: 1,
        fromTrack: false,
        flightId: null,
        createdAt: "2026-10-01T20:00:00Z",
        ...over,
      }) as LogbookEntry;
    const written = logbookCsv([
      entry({}),
      entry({ id: 2, flownOn: "2026-09-01", route: null, remarks: null, holding: false, tracking: false }),
    ]);
    expect(written.split("\r\n")[0]).toBe(
      "Date,AircraftID,TypeCode,Route,TotalTime,AirTime,Night,CrossCountry,Solo,DualReceived,Instrument,AllLandings,NightLandingsFullStop,TouchAndGoes,ToweredLandings,Distance,LongestLeg,Approaches,Holds,Tracking,PilotComments",
    );
    const { entries, skipped } = importLogbook(written);
    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.flownOn)).toEqual(["2026-09-01", "2026-10-01"]);
    const asLogged = Object.fromEntries(Object.entries(entry({})).filter(([k]) => k !== "id" && k !== "createdAt"));
    expect(entries[1]).toEqual(asLogged);
    expect(entries[0]).toMatchObject({ route: null, remarks: null, holding: false, tracking: false });
  });
});

// The shared fixture the iPhone app's LogbookCSV (PilotLogic.swift) is
// tested against too (WingtipTests/SharedFixturesTests.swift): a logbook
// written or read on either comes out the same (docs/NATIVE.md).
describe("the shared logbook CSV fixture", () => {
  it.each(logbookFixture.export.map((c, i) => ({ ...c, i })))("written out, case $i", ({ entries, csv }) => {
    expect(logbookCsv(entries as unknown as LogbookEntry[])).toBe(csv);
  });

  it.each(logbookFixture.import)("$name", ({ text, entries, skipped }) => {
    expect(importLogbook(text)).toEqual({ entries, skipped });
  });
});
