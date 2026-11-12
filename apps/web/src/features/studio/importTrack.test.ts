import { describe, expect, it } from "vitest";
import { TrackError } from "../../lib/track";
import { readCsvTrack } from "./importTrack";

describe("a CSV track for the Studio", () => {
  it("reads quoted fields, CR LF lines and blank lines by the engine's reader", () => {
    const text = '\r\n"time","lat","lon","note"\r\n2026-11-10 01:00:00,45,-93,"a, ""b"""\r\n\r\n2026-11-10 01:00:10,45.01,-93,\r\n';
    expect(readCsvTrack(text).map((r) => r.lat)).toEqual([45, 45.01]);
  });

  it("reads Flightradar24's export, its position one quoted column", () => {
    const text = [
      "Timestamp,UTC,Callsign,Position,Altitude,Speed,Direction",
      '1762736400,2026-11-10T01:00:00Z,N14511,"29.98,-95.36",1200,162,152',
      '1762736420,2026-11-10T01:00:20Z,N14511,"29.99,-95.37",1700,170,150',
    ].join("\n");
    expect(readCsvTrack(text)).toEqual([
      { t: 1762736400, lat: 29.98, lon: -95.36, alt_ft: 1200, gs_kt: 162, track_deg: 152 },
      { t: 1762736420, lat: 29.99, lon: -95.37, alt_ft: 1700, gs_kt: 170, track_deg: 150 },
    ]);
  });

  it("reads columns of its own, an ISO time in UTC where it names no zone", () => {
    const text = "time,lat,lon,alt_ft\n2026-11-10 01:00:00,45,-93,3000\n2026-11-10 01:00:10,45.01,-93,3050\n";
    expect(readCsvTrack(text)[0]).toMatchObject({ t: Date.UTC(2026, 10, 10, 1) / 1000, alt_ft: 3000, gs_kt: null });
  });

  it("says what is missing where it has no time or position", () => {
    expect(() => readCsvTrack("name,value\na,1\n")).toThrow(TrackError);
  });
});
