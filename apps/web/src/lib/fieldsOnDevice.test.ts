import { describe, expect, test } from "vitest";
import { indexOf } from "./airportIndex";
import { fieldsNear, nearestOnDevice } from "./fieldsOnDevice";

/** A few rows of the planner's index (wingtip.airports.search_index):
 *  ident, name, town, state, size, lat, lon. */
const index = indexOf(
  [
    ["C02", "Grand Geneva Resort", "Lake Geneva", "WI", 2, 42.61, -88.39],
    // Nearer than any, and closed by NASR: never a field offered (decision 0043).
    ["9WI9", "Gone Strip", "Elkhorn", "WI", 2, 42.65, -88.5],
    ["KUGN", "Waukegan National", "Waukegan", "IL", 1, 42.42, -87.87],
    ["KENW", "Kenosha Regional", "Kenosha", "WI", 1, 42.6, -87.93],
    // A heliport: never a landing field offered.
    ["WI99", "Hospital Heliport", "Elkhorn", "WI", 3, 42.67, -88.54],
    ["KORD", "Chicago O'Hare Intl", "Chicago", "IL", 0, 41.98, -87.9],
  ],
  { "9WI9": "Closed permanently" },
);
const at = { lat: 42.65, lon: -88.5 };

describe("the fields round a point from the browser's index", () => {
  test("landing fields only, nearest first, and nothing said that the index does not hold", () => {
    const fields = fieldsNear(index, at, 3);
    expect(fields.map((f) => f.ident)).toEqual(["C02", "KENW", "KUGN"]);
    expect(fields[0]).toMatchObject({ elevation_ft: null, runways: [], metar: null, private: null, towered: null });
  });

  test("Nearest's rows carry the engine's great-circle distance and course", () => {
    const rows = nearestOnDevice(index, at, 4);
    expect(rows.map((r) => r.ident)).toEqual(["C02", "KENW", "KUGN", "KORD"]);
    expect(rows[0]).toMatchObject({ kind: "small", municipality: "Lake Geneva" });
    // About 5.4 nm south-east of the point.
    expect(rows[0]!.distance_nm).toBeGreaterThan(5);
    expect(rows[0]!.distance_nm).toBeLessThan(6);
    expect(rows[0]!.bearing_deg).toBeGreaterThan(90);
    expect(rows[0]!.bearing_deg).toBeLessThan(180);
  });
});
