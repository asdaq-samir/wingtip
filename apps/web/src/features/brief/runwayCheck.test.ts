import { describe, expect, it } from "vitest";
import c172Json from "../../../../../data/aircraft/c172.json?raw";
import type { AircraftProfile, Airport, Briefing, Course } from "../../lib/api/types";
import { runwayChecks } from "./runwayCheck";

const c172 = { name: "c172", ...JSON.parse(c172Json) } as AircraftProfile;

const field = (ident: string, elevation: number): Airport => ({
  ident,
  name: ident,
  lat: 0,
  lon: 0,
  elevation_ft: elevation,
  kind: "airport",
});
const runway = (length: number, headwind: number, crosswind: number, extra: object = {}) => ({
  ends: "09/27",
  length_ft: length,
  width_ft: 75,
  surface: "ASP",
  lighted: true,
  closed: false,
  runway_ends: [],
  wind: { end: "27", headwind_kt: headwind, crosswind_kt: crosswind },
  ...extra,
});

// The distances, the soft surfaces, the crosswind and the runway the wind
// favours are the engine's, each tested there on these same fields
// (engine/facade/tests/gonogo/runways_cases.rs and runways_more_cases.rs):
// here, that the airplane, the course's fields, the briefing and the
// picks reach "gonogo_runway_checks", and that its answer is read back,
// each runway by its index into the field's own.
describe("the runway check", () => {
  const course = {
    departure: field("C81", 900),
    destination: field("KDLH", 1400),
    stops: [],
    distance_nm: 300,
    bearing_deg: 330,
    course_line: [],
  } as unknown as Course;
  const briefing = {
    metars: { C81: { temp_c: 30, altimeter_in_hg: 29.92 }, KDLH: null },
    airports: { C81: { runways: [runway(1500, 2, 18)] }, KDLH: { runways: [runway(9000, 10, 3), runway(12000, 0, 0, { closed: true })] } },
  } as unknown as Briefing;

  it("takes off from the departure and lands at the destination, on the runway the wind favours", () => {
    const [from, to] = runwayChecks(c172, briefing, course, 2550, 2400);
    expect(from!.role).toBe("Departure");
    expect(from!.distances.map((d) => d.kind)).toEqual(["takeoff"]);
    expect(to!.distances.map((d) => d.kind)).toEqual(["landing"]);
    // A closed runway is not one to land on, however long.
    expect(to!.runway!.length_ft).toBe(9000);
    expect(to!.reported).toBe(false);
  });

  it("says a runway too short and a crosswind past the 172S's demonstrated 15 kt", () => {
    const [from] = runwayChecks(c172, briefing, course, 2550, 2400);
    expect(from!.distances[0]!.over).toBe(true);
    expect(from!.crosswindKt).toBe(18);
    expect(from!.crosswindOver).toBe(true);
    expect(from!.densityAltFt!).toBeGreaterThan(from!.pressureAltFt!);
  });

  it("checks the runway the pilot picked in FPL, whatever the wind, with the wind on the end picked", () => {
    // KDLH: a long runway into the wind, and a short one the pilot picked.
    const ends = (a: string, b: string) => [
      { ident: a, heading_true_deg: 0 },
      { ident: b, heading_true_deg: 180 },
    ];
    const picked = {
      ...briefing,
      airports: {
        ...briefing.airports,
        KDLH: {
          runways: [
            runway(9000, 10, 3, { ends: "09/27", runway_ends: ends("09", "27") }),
            runway(1200, 8, 0, { ends: "18/36", runway_ends: ends("18", "36"), wind: { end: "36", headwind_kt: 8, crosswind_kt: 0 } }),
          ],
        },
      },
    } as unknown as Briefing;
    const pick = { pattern: new Map([["KDLH", "18"]]), takeoff: new Map<string, string>() };
    const flown = runwayChecks(c172, picked, course, 2550, 2400, pick)[1]!;
    // 18 is the far end of the wind's 36: its headwind is a tailwind.
    expect([flown.end, flown.picked, flown.headwindKt, flown.runway!.length_ft]).toEqual(["18", true, -8, 1200]);
    expect(flown.distances[0]!.over).toBe(true);
  });

  it("is not worked out without the POH's tables", () => {
    expect(runwayChecks({ ...c172, takeoff: null }, briefing, course, 2550, 2400)).toEqual([]);
  });
});
