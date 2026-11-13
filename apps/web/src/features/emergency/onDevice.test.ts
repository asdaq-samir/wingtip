import { describe, expect, test } from "vitest";
import { indexOf } from "../../lib/airportIndex";
import { fieldsNear } from "../../lib/fieldsOnDevice";
import { bestFieldsOnDevice } from "./emergency";

/** A few rows of the planner's index (wingtip.airports.search_index):
 *  ident, name, town, state, size, lat, lon. */
const index = indexOf([
  ["C02", "Grand Geneva Resort", "Lake Geneva", "WI", 2, 42.61, -88.39],
  ["KUGN", "Waukegan National", "Waukegan", "IL", 1, 42.42, -87.87],
  ["KENW", "Kenosha Regional", "Kenosha", "WI", 1, 42.6, -87.93],
  // A heliport: never a landing field offered.
  ["WI99", "Hospital Heliport", "Elkhorn", "WI", 3, 42.67, -88.54],
  ["KORD", "Chicago O'Hare Intl", "Chicago", "IL", 0, 41.98, -87.9],
]);
const at = { lat: 42.65, lon: -88.5 };

describe("Emergency from the browser's index", () => {
  test("Emergency ranks them with no airplane nearest first, the glide not guessed", () => {
    const ranked = bestFieldsOnDevice(fieldsNear(index, at, 3), null, { ...at, altitudeFt: 4500, speedKt: 100 }, null);
    expect(ranked.needs_airplane).toBe(true);
    expect(ranked.fields.map((f) => f.ident)).toEqual(["C02", "KENW", "KUGN"]);
  });
});
