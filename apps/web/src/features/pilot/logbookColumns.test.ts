import { describe, expect, it } from "vitest";
import { csvRows, guessColumns, headerRowOf, missingColumns, remapped } from "./logbookColumns";
import { importLogbook } from "./logbookCsv";

/** A MyFlightbook export's columns as it names them, a few of its many:
 *  its "Aircraft ID" its own number, the tail under "Tail Number". */
const MYFLIGHTBOOK = [
  "Date,Aircraft ID,Tail Number,Model,Route,Approaches,Hold,Landings,FS Night Landings,X-Country,Night,IMC,Simulated Instrument,Dual Received,Total Flight Time,Comments",
  '2026-10-04,48213,N12345,C172,KMIC KANE,0,,3,0,0,0,0,0,0,1.2,"Pattern work, then home"',
  "10/12/2026,48213,N12345,C172,KMIC KSTC KMIC,2,TRUE,1,1,1.8,1.0,0.3,0.5,0,2.0,",
].join("\r\n");

describe("a logbook whose columns are not ForeFlight's", () => {
  it("finds the row of names and guesses each field's column, the tail before MyFlightbook's own number", () => {
    const rows = csvRows(MYFLIGHTBOOK);
    const at = headerRowOf(rows);
    expect(at).toBe(0);
    const columns = guessColumns(rows[at]!);
    expect(columns.AircraftID).toBe(2);
    expect(columns.TypeCode).toBe(3);
    expect(columns.TotalTime).toBe(14);
    expect(columns.AllLandings).toBe(7);
    expect(columns.NightLandingsFullStop).toBe(8);
    expect(columns.ActualInstrument).toBe(11);
    expect(columns.PilotComments).toBe(15);
    expect(missingColumns(columns)).toEqual([]);
  });

  it("writes it again under ForeFlight's names for the engine to read, its quoted cells kept", () => {
    const rows = csvRows(MYFLIGHTBOOK);
    const text = remapped(rows, 0, guessColumns(rows[0]!));
    expect(text.split("\r\n")[0]).toBe(
      "Date,AircraftID,TypeCode,Route,TotalTime,Night,CrossCountry,AllLandings,NightLandingsFullStop,DualReceived,ActualInstrument,SimulatedInstrument,Approaches,Holds,PilotComments",
    );
    const read = importLogbook(text);
    expect(read.skipped).toEqual([]);
    expect(read.entries).toHaveLength(2);
    expect(read.entries[0]).toMatchObject({
      flownOn: "2026-10-04",
      aircraft: "N12345",
      aircraftType: "C172",
      totalHours: 1.2,
      dayLandings: 3,
      remarks: "Pattern work, then home",
    });
    // A spreadsheet's day, 1/2/2002, read as ForeFlight's: the engine's.
    expect(read.entries[1]).toMatchObject({ flownOn: "2026-10-12", nightLandings: 1, dayLandings: 0, instrumentHours: 0.8, approaches: 2 });
  });

  it("names the fields the engine cannot do without when no column is given them", () => {
    const columns = guessColumns(["When", "Plane", "Hours"]);
    expect(missingColumns(columns).map((t) => t.field)).toEqual(["Date", "AircraftID", "TotalTime"]);
  });
});
