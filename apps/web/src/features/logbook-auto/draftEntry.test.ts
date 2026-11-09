import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/logbookTrack.json";
import type { FlightSummary } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import { entryRequest, flightEnded, likelyFlight } from "./draftEntry";
import type { RecordedPoint } from "./recorder";

// The shared C81 to KDLH flight the engine's and the planner's tests read:
// it ends at rest at KDLH, a touch-and-go and a night full stop after two
// ILS RWY 27s and a hold at CHERL.
const points = fixture.points as RecordedPoint[];
const draft = callEngine("logbook_from_track", {
  points, fields: fixture.fields, drawings: fixture.drawings as never, picked: fixture.picked,
  aircraft: fixture.aircraft, aircraft_type: fixture.aircraft_type, utc_offset_min: fixture.utc_offset_min,
});

describe("a flight logged from the track", () => {
  it("has ended once the engine reads it at rest after its last landing", () => {
    const to = flightEnded(draft, points, null);
    expect(to).toBe(draft.block.to);
    // Not offered again once let go, nor while still in the air.
    expect(flightEnded(draft, points, to)).toBeNull();
    const inTheAir = points.filter(p => p.t < fixture.points[1500]!.t);
    expect(flightEnded(callEngine("logbook_from_track", { points: inTheAir }), inTheAir, null)).toBeNull();
  });

  it("logs 61.57(c)'s approaches and hold only when flown by instruments", () => {
    const visual = entryRequest(draft, {}, false, null);
    expect(visual).toMatchObject({ route: "C81 KDLH", totalHours: 4, dayLandings: 1, nightLandings: 1, touchAndGoes: 1, approaches: 0, holding: false, fromTrack: true });
    const hood = entryRequest(draft, { totalHours: 4.1 }, true, 7);
    expect(hood).toMatchObject({ approaches: 2, holding: true, tracking: true, totalHours: 4.1, flightId: 7 });
  });

  it("is debriefed against the saved flight between the same fields", () => {
    const flight = (id: number, from: string, to: string) => ({ id, departureIdent: from, destinationIdent: to, stops: [] }) as unknown as FlightSummary;
    expect(likelyFlight([flight(1, "C81", "KRST"), flight(2, "C81", "KDLH")], "C81 KDLH")?.id).toBe(2);
    expect(likelyFlight([flight(1, "C81", "KRST")], "C81 KDLH")).toBeNull();
  });
});
