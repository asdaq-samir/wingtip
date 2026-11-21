import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/edgePlaces.json";
import { routeAdiz } from "./adiz";
import type { NavLogRow } from "./navLogRows";

// A row of the nav log at a field, as rowPoint reads it: only its place.
const row = (kind: "departure" | "stop" | "destination", ident: string, lat: number, lon: number) =>
  ({ kind, key: `${kind}-${ident}`, airport: { ident, lat, lon, kind: "airport" }, minutesFlown: 0 }) as unknown as NavLogRow;

describe("the ADIZs a route meets (the engine's route_adiz, 14 CFR 99.41-99.49)", () => {
  test.each(fixture.adiz.routes)("$why", ({ points, zones, lead }) => {
    const rows = points.map((p, i) => row(i === 0 ? "departure" : i === points.length - 1 ? "destination" : "stop", `P${i}`, p.lat, p.lon));
    const answer = routeAdiz(rows)!;
    expect(answer.zones).toEqual(zones);
    expect(answer.brief?.lead ?? null).toBe(lead);
  });

  test("no rows, no answer", () => {
    expect(routeAdiz([])).toBeNull();
  });
});
