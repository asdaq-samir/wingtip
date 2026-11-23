import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/jurisdiction.json";
import { routeJurisdiction, rowCautions } from "./jurisdiction";
import type { NavLogRow } from "./navLogRows";

// A row of the nav log at a field, as rowPoint reads it: only its place.
const row = (kind: "departure" | "stop" | "destination", ident: string, lat: number, lon: number) =>
  ({ kind, key: `${kind}-${ident}`, airport: { ident, lat, lon, kind: "airport" }, minutesFlown: 0 }) as unknown as NavLogRow;

describe("whose rules the route is under (the engine's route_jurisdiction, decision 0053)", () => {
  test.each(fixture.routes)("$why", ({ points, codes, legs, outside, caution, legCautions }) => {
    const rows = points.map((p, i) => row(i === 0 ? "departure" : i === points.length - 1 ? "destination" : "stop", p.name, p.lat, p.lon));
    const answer = routeJurisdiction(rows)!;
    expect(answer.points.map((p) => p.code)).toEqual(codes);
    expect(answer.legs.map((l) => l.codes)).toEqual(legs);
    expect(answer.outside).toEqual(outside);
    expect(answer.brief?.lead ?? null).toBe(caution);
    expect(answer.legs.map((l) => l.caution)).toEqual(legCautions);
  });

  test("a leg across Canada is said on the leg, by where it goes; a field in Canada at the field", () => {
    // Detroit City to Cleveland: both ends in the US, the leg over Ontario.
    const rows = [row("departure", "KDET", 42.4092, -83.0099), row("destination", "KBKL", 41.5175, -81.6833)];
    const leg = "The leg to KBKL crosses Canada (Ontario): Canadian rules not checked — figures use US rules";
    expect(rowCautions(rows)).toEqual([
      { at: null, leaving: leg },
      { at: null, leaving: null },
    ]);
    // Duluth to Thunder Bay: the field is in Canada, said there alone.
    const north = [row("departure", "KDLH", 46.842, -92.1936), row("destination", "CYQT", 48.3719, -89.3239)];
    expect(rowCautions(north)).toEqual([
      { at: null, leaving: null },
      { at: "CYQT is in Canada (Ontario): Canadian rules not checked — figures use US rules", leaving: null },
    ]);
    expect(routeJurisdiction([])).toBeNull();
  });
});
