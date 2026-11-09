import { describe, expect, test } from "vitest";
import { departureLine } from "./departureWords";

describe("a tower departure event", () => {
  test("says when the clearance was delivered, from where, the gate and the destination", () => {
    // SWA1097 at KIND, 2026-11-09 04:57:51Z, as the feed sent it.
    expect(
      departureLine({
        ident: "SWA1097",
        flight_id: "KI075012bR",
        departure: "KIND",
        destination: "KRSW",
        gate: "B20",
        times: { clearance_delivery: 1794200271 },
        event_at: 1794200271,
        heard: 1794200272,
      }),
    ).toBe("Cleared 0457Z at KIND, gate B20, to KRSW (FAA TDES)");
  });

  test("never claims a time it was not given", () => {
    expect(departureLine({ ident: "N719AL", departure: "KSEA", times: {}, heard: 0 })).toBe("Departure event at KSEA (FAA TDES)");
    expect(departureLine(undefined)).toBeNull();
  });
});
