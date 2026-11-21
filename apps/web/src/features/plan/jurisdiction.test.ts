import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/jurisdiction.json";
import { routeJurisdiction, rowCautions } from "./jurisdiction";
import type { NavLogRow } from "./navLogRows";

// A row of the nav log at a field, as rowPoint reads it: only its place.
const row = (kind: "departure" | "stop" | "destination", ident: string, lat: number, lon: number) =>
  ({ kind, key: `${kind}-${ident}`, airport: { ident, lat, lon, kind: "airport" }, minutesFlown: 0 }) as unknown as NavLogRow;

describe("whose rules the route is under (the engine's route_jurisdiction, decision 0053)", () => {
  test.each(fixture.routes)("$why", ({ points, codes, legs, outside, caution }) => {
    const rows = points.map((p, i) => row(i === 0 ? "departure" : i === points.length - 1 ? "destination" : "stop", `P${i}`, p.lat, p.lon));
    const answer = routeJurisdiction(rows)!;
    expect(answer.points.map((p) => p.code)).toEqual(codes);
    expect(answer.legs.map((l) => l.codes)).toEqual(legs);
    expect(answer.outside).toEqual(outside);
    expect(answer.brief?.lead ?? null).toBe(caution);
  });

  test("each row's warning is its own point's, else the leg's into it", () => {
    // Detroit City to Cleveland: both ends in the US, the leg over Ontario.
    const rows = [row("departure", "KDET", 42.4092, -83.0099), row("destination", "KBKL", 41.5175, -81.6833)];
    expect(rowCautions(rows)).toEqual([null, "Canada: rules not checked — figures use US rules"]);
    expect(routeJurisdiction([])).toBeNull();
  });
});
