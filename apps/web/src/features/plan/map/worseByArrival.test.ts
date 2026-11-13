import { describe, expect, it } from "vitest";
import fixture from "../../../lib/fixtures/airportWeatherMarks.json";
import type { Briefing, Course } from "../../../lib/api/types";
import { worseByArrival } from "./worseByArrival";
import { geoLoaded } from "../../../lib/geo";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const geo = await geoLoaded;

type Field = { ident: string; ceiling_ft: number; visibility_sm: number };

/** A one-field "local" plan whose briefing has the field's METAR now and
 *  its own TAF for the flight's time there. */
function plan(now: Field, atEta: Field | null): [Briefing, Course] {
  const field = { ident: now.ident, lat: 46.8, lon: -92.2, kind: "airport" };
  const course = { departure: field, destination: field, stops: [] } as unknown as Course;
  const station = atEta && {
    icaoId: atEta.ident,
    ceiling_ft: atEta.ceiling_ft,
    visibility_sm: atEta.visibility_sm,
    eta: "2026-11-10T18:00:00Z",
    eta_ceiling_ft: atEta.ceiling_ft,
    eta_visibility_sm: atEta.visibility_sm,
    eta_ceiling_unknown: false,
  };
  const briefing = {
    metars: { [now.ident]: { ceiling_ft: now.ceiling_ft, visibility_sm: now.visibility_sm, ceiling_unknown: false } },
    forecast: { stations: station ? [station] : [] },
  } as unknown as Briefing;
  return [briefing, course];
}

describe("the getting-worse badge, as the shared fixture says", () => {
  it("is the engine's weather_worse from the METAR now to the TAF at the ETA", () => {
    for (const c of fixture.worseByArrival) {
      const [briefing, course] = plan(c.now[0]!, c.atEta[0]!);
      expect(worseByArrival(geo, briefing, course), c.why).toEqual(c.badged);
    }
  });

  it("is none at a field with no TAF of its own", () => {
    const [briefing, course] = plan({ ident: "KDLH", ceiling_ft: 5000, visibility_sm: 10 }, null);
    expect(worseByArrival(geo, briefing, course)).toEqual([]);
  });
});
