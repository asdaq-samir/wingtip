import { describe, expect, test } from "vitest";
import type { Course, Leg, NavLogAltitude, Totals } from "../../../lib/api/types";
import { directOnDevice } from "./directOnDevice";

const KMSN = { ident: "KMSN", name: "Dane County Regional", lat: 43.14, lon: -89.34 };
const KOSH = { ident: "KOSH", name: "Wittman Regional", lat: 43.98, lon: -88.56 };
const course = {
  departure: KMSN,
  destination: KOSH,
  stops: [],
  course_line: [
    [43.14, -89.34],
    [43.5, -89.0],
    [43.98, -88.56],
  ],
  distance_nm: 60,
  bearing_deg: 34,
  chart_layers: [],
  chart_cycle: "test",
  min_zoom: 5,
  max_zoom: 12,
} as unknown as Course;
const air = { altitude_ft: 4500, wind: { wind_dir_true_deg: 270, wind_speed_kt: 20 }, oat_c: 5 };
const legs = [
  { ...air, from: "KMSN", to: "Waterloo", distance_nm: 25 },
  { ...air, from: "Waterloo", to: "KOSH", distance_nm: 35 },
] as unknown as Leg[];
const nav = {
  flown: "custom",
  altitude_ft: 4500,
  aircraft: { name: "c172", cruise_tas_kt: 110, fuel_burn_gph: 8.5, service_ceiling_ft: 14000 },
} as unknown as NavLogAltitude;
const fix = { lat: 43.5, lon: -89.0, altitudeFt: 4500 };

describe("a Direct To worked out on the device", () => {
  test("one engine leg from the position to the point, in the planned leg's air, and its totals", () => {
    const made = directOnDevice({ course, legs, nav, totals: null }, "KOSH", fix)!;
    expect(made.dep).toBe("@43.5000,-89.0000,4500");
    const flown = made.messages.filter((m) => m.type === "leg") as unknown as Leg[];
    expect(flown).toHaveLength(1);
    expect(flown[0]).toMatchObject({ from: made.dep, to: "KOSH", altitude_ft: 4500 });
    // About 33 nm north-east, as the great circle has it.
    expect(flown[0]!.distance_nm).toBeGreaterThan(30);
    expect(flown[0]!.distance_nm).toBeLessThan(36);
    expect(flown[0]!.groundspeed_kt).not.toBeNull();
    const done = made.messages.find((m) => m.type === "done") as { totals: { distance_nm: number; hops: unknown[] } };
    expect(done.totals.distance_nm).toBeCloseTo(flown[0]!.distance_nm, 0);
    // The hops the page reads the next landing from (nextLanding), there.
    expect(done.totals.hops).toEqual([]);
    expect(made.course.departure).toMatchObject({ name: "Present position", lat: 43.5, lon: -89.0 });
    expect(made.course.course_line[0]).toEqual([43.5, -89.0]);
    expect(made.course.course_line.at(-1)).toEqual([43.98, -88.56]);
  });

  test("the direct's fuel required is the engine's fuel plan over its legs: their fuel and a reserve after them", () => {
    const made = directOnDevice({ course, legs, nav, totals: null }, "KOSH", fix)!;
    const done = made.messages.find((m) => m.type === "done") as unknown as { totals: Totals };
    const { fuel_gal, fuel_required_gal, reserve_min, reserve_gal } = done.totals;
    // 14 CFR 91.151(a): 30 minutes by day, 45 at night, at 8.5 gal/h.
    expect([30, 45]).toContain(reserve_min);
    expect(reserve_gal).toBeCloseTo((reserve_min! / 60) * 8.5, 1);
    expect(fuel_required_gal).toBeCloseTo(fuel_gal! + reserve_gal!, 0);
    // Under IFR, 45 whatever the hour (14 CFR 91.167(a)(3)), the alternate's leg before it.
    const ifr = directOnDevice(
      { course, legs, nav, totals: { rules: "ifr", alternate: { fuel_gal: 3 } } as unknown as Totals },
      "KOSH",
      fix,
    )!;
    const ifrDone = ifr.messages.find((m) => m.type === "done") as unknown as { totals: Totals };
    expect(ifrDone.totals.reserve_min).toBe(45);
    expect(ifrDone.totals.fuel_required_gal).toBeCloseTo(ifrDone.totals.fuel_gal! + 3 + ifrDone.totals.reserve_gal!, 0);
  });

  test("with no airplane the direct still flies, its fuel required unknown, never guessed", () => {
    const made = directOnDevice({ course, legs, nav: null, totals: null }, "KOSH", fix)!;
    expect(made).not.toBeNull();
    const done = made.messages.find((m) => m.type === "done") as unknown as { totals: Totals };
    expect(done.totals.fuel_required_gal ?? null).toBeNull();
  });

  test("nothing worked out for a point not on the route, or with no legs yet", () => {
    expect(directOnDevice({ course, legs, nav, totals: null }, "KATW", fix)).toBeNull();
    expect(directOnDevice({ course, legs: [], nav, totals: null }, "KOSH", fix)).toBeNull();
  });
});
