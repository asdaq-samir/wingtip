import { describe, expect, test } from "vitest";
import type { EmergencyFields, Leg } from "./api/types";
import { callEngine } from "./engine/engine";
import { ALLOWANCES, divert, diversionFields, reasonable, windTriangle } from "./diversion";
import { stopwatch } from "./format";

const leg = { tas_kt: 110, fuel_burn_gph: 8.5, magnetic_variation_deg: -3, wind: { wind_dir_true_deg: 270, wind_speed_kt: 20 } } as Leg;

describe("a diversion worked out", () => {
  test("the wind triangle", () => {
    // A direct headwind: no correction, the ground speed the difference.
    expect(windTriangle(270, 110, 270, 20)).toMatchObject({ wca: 0, th: 270, gs: 90 });
    // From the left on a northerly course: correct left, a little slower.
    const north = windTriangle(360, 110, 270, 20)!;
    expect(north.wca).toBeCloseTo(-10.48, 1);
    expect(north.th).toBeCloseTo(349.52, 1);
    expect(north.gs).toBeCloseTo(108.2, 1);
    // A wind faster than the airplane across the course holds no heading.
    expect(windTriangle(360, 50, 270, 60)).toBeNull();
  });

  test("to the field: heading magnetic, time and fuel at the leg's burn", () => {
    const d = divert(leg, 360, 18)!;
    // 3° west: west is best, so it is added.
    expect(d.mh).toBeCloseTo(352.52, 1);
    expect(d.ete).toBeCloseTo((18 / d.gs) * 60, 6);
    expect(d.fuel).toBeCloseTo((d.ete / 60) * 8.5, 6);
    // No wind is calm.
    expect(divert({ ...leg, wind: null } as Leg, 90, 22)).toMatchObject({ wca: 0, gs: 110, ete: 12 });
  });

  test("a reasonable estimate, headings round the compass", () => {
    expect(reasonable("mh", 2, 355)).toBe(true);
    expect(reasonable("mh", 10, 355)).toBe(false);
    expect(reasonable("ete", 13, 10)).toBe(true);
    expect(reasonable("fuel", 3.6, 2.5)).toBe(false);
    expect(stopwatch(Math.floor(127_400 / 1000))).toBe("2:07");
  });
});

describe("the drill's allowances are the engine's", () => {
  test("the same keys, labels, units and allowances", () => {
    const { checks } = callEngine("diversion", {
      true_course_deg: 360,
      distance_nm: 18,
      tas_kt: 110,
      fuel_burn_gph: 8.5,
      magnetic_variation_deg: -3,
      wind: null,
    });
    expect(checks.map(({ key, label, unit, allowance }) => ({ key, label, unit, allowance }))).toEqual(ALLOWANCES);
  });
});

describe("the fields a diversion goes to, the engine's pick (best_fields, diversion)", () => {
  // Round a point over Lake County, Illinois: alike but for who may land
  // there, and one NASR lists as closed nearest of all.
  const at = { lat: 42.4, lon: -88.0 };
  const runway = {
    closed: false,
    surface: "ASPH",
    length_ft: 4000,
    runway_ends: [
      { ident: "18", heading_true_deg: 180 },
      { ident: "36", heading_true_deg: 0 },
    ],
  };
  const field = (ident: string, north: number, over: Partial<EmergencyFields["fields"][number]> = {}) => ({
    ident,
    name: ident,
    lat: at.lat + north / 60,
    lon: at.lon,
    elevation_ft: 800,
    runways: [runway],
    metar: { dir_true_deg: 0, speed_kt: 5, flight_category: "VFR" },
    towered: false,
    private: false,
    military: null,
    status: "O",
    distance_nm: 0,
    bearing_deg: 0,
    frequencies: [],
    ...over,
  });
  const data = {
    fields: [
      field("SHUT", 3, { status: "CI" }),
      field("PRIV", 6, { private: true }),
      field("MILT", 7, { military: "military" }),
      field("JOIN", 8, { military: "joint" }),
      field("PUBL", 9),
    ],
  } as EmergencyFields;
  const legHere = { ...leg, altitude_ft: 4500 } as Leg;

  test("never a closed field; a public or joint-use one before a private or military-only one otherwise alike, each said", () => {
    const fields = diversionFields(data, at, legHere);
    const order = fields.map((f) => f.ident);
    expect(order).not.toContain("SHUT");
    expect(order.indexOf("JOIN")).toBeLessThan(order.indexOf("PRIV"));
    expect(order.indexOf("PUBL")).toBeLessThan(order.indexOf("MILT"));
    const said = (ident: string) =>
      fields
        .find((f) => f.ident === ident)!
        .reasons.map((r) => r.text)
        .join(" ");
    expect(said("PRIV")).toContain("Private: permission required");
    expect(said("MILT")).toContain("Military: prior permission required");
  });
});
