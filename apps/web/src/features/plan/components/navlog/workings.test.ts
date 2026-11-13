import { describe, expect, test } from "vitest";
import type { Leg } from "../../../../lib/api/types";
import { bearing } from "../../../../lib/format";
import { checks, workingsOf } from "./workings";

// C81 to the first checkpoint, as the planner flew it: west-northwest
// into a southwest wind.
const LEG = {
  from: "C81",
  to: "Lake",
  distance_nm: 20,
  altitude_ft: 4500,
  true_course_deg: 300,
  wind: { wind_dir_true_deg: 240, wind_speed_kt: 20, temp_c: 5 },
  wca_deg: -9.0,
  true_heading_deg: 291,
  magnetic_variation_deg: -3,
  magnetic_heading_deg: 294,
  groundspeed_kt: 99,
  ete_min: 14.1,
  fuel_gal: 2.0,
  tas_kt: 110,
  fuel_burn_gph: 8.5,
  power_pct: 65,
  oat_c: 5,
  density_altitude_ft: 5000,
  climb_min: 2,
} as unknown as Leg;

describe("a leg worked out", () => {
  test("the wind triangle's steps end in the log's own figures", () => {
    const w = workingsOf(LEG)!;
    expect(w.steps.map((s) => s.name)).toEqual([
      "True course",
      "Wind",
      "True airspeed",
      "Wind correction",
      "True heading",
      "Magnetic heading",
      "Compass heading",
      "Ground speed",
      "Time",
      "Fuel",
    ]);
    expect(w.steps.find((s) => s.name === "Magnetic heading")!.sum).toBe("291° + 3° W (east is least, west is best)");
    expect(w.steps.find((s) => s.name === "Wind correction")!.result).toBe("−9° (left)");
    // Cruise alone: 20 nm at 99 kt, 12.1 min; the climb is the rest of the log's 14.1.
    expect(w.answers.ete).toBeCloseTo(12.12, 1);
    expect(w.climb!.min).toBeCloseTo(1.98, 1);
  });

  test("a procedure's minutes are its own row, not the climb's", () => {
    // The same leg flown out by a pattern departure 3.4 nm and 2.3 min
    // longer than its line: 14.1 + 2.3 in the log, the climb still 2.
    const w = workingsOf({
      ...LEG,
      ete_min: 16.4,
      fuel_gal: 2.33,
      procedure: {
        path: [],
        ft: [],
        nm: 23.4,
        landing: false,
        final_at: null,
        map_at: null,
        missed: null,
        more_nm: 3.4,
        more_min: 2.3,
        more_gal: 0.33,
      },
    } as Leg)!;
    expect(w.climb!.min).toBeCloseTo(1.98, 1);
    expect(w.procedure).toMatchObject({ nm: 3.4, min: 2.3, landing: false });
  });

  test("a student's figures are right within an E6B's accuracy, headings round the compass", () => {
    expect(checks("mh", 296, 294)).toBe(true);
    expect(checks("mh", 297, 294)).toBe(false);
    expect(checks("th", 1, 359)).toBe(true);
    expect(checks("gs", 102, 99)).toBe(true);
    expect(checks("fuel", 1.4, 1.7)).toBe(true);
  });

  test("no figures to work out for a leg the wind will not let fly", () => {
    expect(workingsOf({ ...LEG, groundspeed_kt: null, ete_min: null, fuel_gal: null } as Leg)).toBeNull();
    expect(bearing(0)).toBe("360°");
  });
});

describe("a row flown all in the climb", () => {
  // The same leg climbed whole: the climb speed's own triangle in the same
  // wind (74 kt, 13.5 degrees left, 62 kt over the ground: the engine's
  // with_climbs), its time the miles at that speed and its fuel the
  // climb's 10.5 gal/h, nothing added for a climb it already is.
  const CLIMB = {
    ...LEG,
    tas_kt: 74,
    wca_deg: -13.5,
    groundspeed_kt: 62,
    ete_min: (20 / 62) * 60,
    fuel_burn_gph: 10.5,
    fuel_gal: (20 / 62) * 10.5,
    climb_min: 19,
  } as Leg;

  test("its airspeed is the climb speed, not a cruise power, and its time and fuel are the climb's", () => {
    const w = workingsOf(CLIMB, true)!;
    expect(w.phase).toBe("climb");
    expect(w.steps.find((s) => s.name === "True airspeed")).toMatchObject({ sum: "the airplane's climb speed", result: "74 kt" });
    expect(w.steps.find((s) => s.name === "Fuel")?.sum).toContain("the climb's 10.5 gal/h");
    expect(w.answers.ete).toBeCloseTo(CLIMB.ete_min!, 6);
    expect(w.climb).toBeNull();
  });
});
