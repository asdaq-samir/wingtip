import { describe, expect, it } from "vitest";
import type { Airport, Leg, LegProcedure } from "../../lib/api/types";
import { geoLoaded } from "../../lib/geo";
import { dryRunAt, dryRunFlown, dryRunOf, dryRunRow, runNmAt } from "./dryRun";
import { navLogRows } from "./navLogRows";

// The engine's geodesic rules, loaded by the setup file (vitestSetup).
const { distanceNm } = await geoLoaded;

const airport = (ident: string, lat: number, elevation: number): Airport =>
  ({ ident, name: ident, lat, lon: -88, elevation_ft: elevation, kind: "airport" }) as Airport;

// One 60 nm leg north at 100 kt over the ground, 36 minutes and 5 gallons,
// climbing for its first 8 nm and down at 3:1 from 48 nm.
const leg = {
  distance_nm: 60,
  ete_min: 36,
  fuel_gal: 5,
  fuel_burn_gph: 8,
  altitude_ft: 5500,
  climb_min: 6,
  groundspeed_kt: 100,
  tas_kt: 110,
  true_course_deg: 0,
  toc: {
    along_nm: 8,
    ete_min: 6,
    fuel_gal: 1,
    altitude_ft: 5500,
    lat: 42.13,
    lon: -88,
    tas_kt: 70,
    groundspeed_kt: 75,
    fuel_burn_gph: null,
    wca_deg: null,
    true_heading_deg: null,
    magnetic_heading_deg: null,
  },
  tod: { along_nm: 48, ete_min: 28.8, fuel_gal: 4, altitude_ft: 5500, to_ft: 1500, pattern: true, fpm: 550, lat: 42.8, lon: -88 },
} as Leg;
const rows = navLogRows({ departure: airport("C81", 42, 800), destination: airport("KDLH", 43, 500) }, [], [leg]);

// How the run flies (its climb and descent, the procedures' paths and
// altitudes, the missed approach's gradient, the hold) is the engine's,
// each tested there on these same legs (engine/facade/tests/motion/
// dry_run_cases.rs): here, that the nav log's rows, the line and the ask
// to go missed reach "dry_run" and are read back, and the page's own
// readings of the run (dryRunAt, dryRunRow, runNmAt, dryRunFlown).
describe("the planned flight, flown on paper", () => {
  const run = dryRunOf(rows, 1_000);

  it("leaves the field at the start, its height the field's, and lands at the end of the legs' time", () => {
    expect(run.points[0]).toMatchObject({ t: 1_000, lat: 42, alt_ft: 800 });
    const last = run.points.at(-1)!;
    expect(last.t).toBeCloseTo(1_000 + 36 * 60);
    expect(last).toMatchObject({ lat: 43, alt_ft: 500 });
  });

  it("says what is left and what is burnt as it goes", () => {
    expect(dryRunAt(run, 1_000)).toEqual({ leftNm: 60, leftS: 36 * 60, burntGal: 0 });
    const end = dryRunAt(run, 1_000 + 36 * 60)!;
    expect(end.leftNm).toBe(0);
    expect(end.burntGal).toBeCloseTo(5);
  });

  it("names the nav log's row it is flying to as it goes, the log's rows each reached in turn", () => {
    expect(run.rowT).toHaveLength(rows.length);
    expect(run.rowT[0]).toBe(1_000);
    expect(run.rowT.at(-1)).toBeCloseTo(1_000 + 36 * 60);
    expect(dryRunRow(run, 1_000)).toBe(0);
    expect(dryRunRow(run, 1_001)).toBe(1);
    expect(dryRunRow(run, 1_000 + 36 * 60 - 1)).toBe(rows.length - 1);
    expect(dryRunRow(run, 9_999_999)).toBe(rows.length - 1);
  });

  it("flies the course line the map draws, not straight across the latitudes and longitudes", () => {
    // A line bent east at its middle: half way along the legs, the
    // airplane is at the bend, on the line, whatever the rows' points say.
    const line: [number, number][] = [
      [42, -88],
      [42.5, -87.9],
      [43, -88],
    ];
    const flown = dryRunOf(rows, 1_000, line);
    const half = flown.points[flown.alongNm.findIndex((a) => a >= 30)]!;
    expect(half.lat).toBeCloseTo(42.5, 2);
    expect(half.lon).toBeCloseTo(-87.9, 2);
  });
});

describe("a leg the planner flies by the procedures picked", () => {
  // The leg in to the test's Duluth (43 N, 88 W) flown by an RNAV (GPS)
  // RWY 27, as the planner gives it (with_procedures): from the leg's
  // start at C81 out to its IAF, PLANE, south-east of the field, north to
  // HOMUV (at or above 2,500), west to its FAF, CIRUS (1,900), and on to
  // the runway; its missed approach west to a hold at UDTEG (3,300).
  const c81 = { lat: 42, lon: -88 },
    plane = { lat: 42.9, lon: -87.8 },
    homuv = { lat: 43, lon: -87.8 };
  const cirus = { lat: 43, lon: -87.9 },
    runway = { lat: 43, lon: -88 },
    udteg = { lat: 43, lon: -88.3 };
  const pathNm = distanceNm(c81, plane) + distanceNm(plane, homuv) + distanceNm(homuv, cirus) + distanceNm(cirus, runway);
  const moreNm = pathNm - 60,
    moreMin = (moreNm / 100) * 60,
    moreGal = (moreMin / 60) * 8;
  const procedure = (ft: (number | null)[] = [null, null, 2500, 1900, null]): LegProcedure => ({
    path: [c81, plane, homuv, cirus, runway].map((p) => [p.lat, p.lon]),
    ft,
    nm: pathNm,
    landing: true,
    final_at: 3,
    map_at: 4,
    missed: { path: [[udteg.lat, udteg.lon]], ft: 3300 },
    more_nm: moreNm,
    more_min: moreMin,
    more_gal: moreGal,
    fix_min: {},
  });
  const flownLeg = (p: LegProcedure) => ({ ...leg, ete_min: 36 + moreMin, fuel_gal: 5 + moreGal, procedure: p }) as Leg;
  const legRows = navLogRows({ departure: airport("C81", 42, 800), destination: airport("KDLH", 43, 500) }, [], [flownLeg(procedure())]);
  const run = dryRunOf(legRows, 1_000);
  const at = (fix: { lat: number; lon: number }) => run.points.find((p) => distanceNm(p, fix) < 0.05);

  it("is the planner's time and fuel, its miles more in them, and its tops of climb and descent passed as it starts", () => {
    expect(run.alongNm.at(-1)).toBeCloseTo(pathNm);
    expect(run.points.at(-1)!.t).toBeCloseTo(1_000 + (36 + moreMin) * 60);
    expect(dryRunAt(run, 9_999_999)!.burntGal).toBeCloseTo(5 + moreGal);
    expect(run.rowT).toHaveLength(legRows.length);
    expect(legRows.map((r) => r.kind)).toEqual(["departure", "toc", "tod", "destination"]);
    expect(run.rowT.slice(0, 3)).toEqual([1_000, 1_000, 1_000]);
    expect(run.rowT.at(-1)).toBeCloseTo(run.points.at(-1)!.t);
  });

  it("lays the route's distance evenly over the leg's path", () => {
    expect(runNmAt(run, 0)).toBeCloseTo(0);
    expect(runNmAt(run, 30)).toBeCloseTo(pathNm / 2);
    expect(runNmAt(run, 60)).toBeCloseTo(pathNm);
  });

  it("goes missed when asked: on from the missed approach point along its missed approach", () => {
    expect(run.missable).toBe(true);
    // On its final from CIRUS, the final approach fix, to the runway: when
    // its Go missed is there.
    expect(run.final!.from).toBeCloseTo(at(cirus)!.t, 0);
    expect(run.final!.to).toBeCloseTo(run.points.at(-1)!.t);
    // Asked to go missed: out west to UDTEG, still flying at the end.
    const missedRun = dryRunOf(legRows, 1_000, undefined, true);
    expect(missedRun.points.at(-1)!.lat).toBeCloseTo(43);
    expect(missedRun.points.at(-1)!.lon).toBeCloseTo(-88.3);
    expect(missedRun.points.at(-1)!.gs_kt).toBeGreaterThan(0);
  });
});

describe("the dry run against its landings, for the flight's own figures", () => {
  // C81 to a stop 60 nm north and on 60 nm to the destination, each flight
  // 36 minutes and 5 gallons, level.
  const level = { ...leg, toc: undefined, tod: undefined, climb_min: 0 } as Leg;
  const stopRows = navLogRows(
    { departure: airport("C81", 42, 800), stops: [airport("KJVL", 43, 800)], destination: airport("KDLH", 44, 500) },
    [],
    [level, level],
  );
  const run = dryRunOf(stopRows, 1_000);

  it("knows each landing, when it is in there, the distance flown and the fuel burnt", () => {
    expect(run.landings.map((l) => l.ident)).toEqual(["KJVL", "KDLH"]);
    expect(run.landings[0]).toMatchObject({ t: 1_000 + 36 * 60, nm: 60, fuel: 5 });
  });

  it("is on the first flight at the start, its whole distance, time and fuel to go", () => {
    expect(dryRunFlown(run, 1_000)).toEqual({
      hop: 0,
      now: 1_000,
      next: { nm: 60, min: 36, at: 1_000 + 36 * 60 },
      last: { nm: 120, min: 72, at: 1_000 + 72 * 60 },
      burntGal: 0,
    });
  });

  it("counts down to the stop half way there, and once in, is on the next flight, its fuel burnt from none", () => {
    const half = dryRunFlown(run, 1_000 + 18 * 60)!;
    expect(half.hop).toBe(0);
    expect(half.next.nm).toBeCloseTo(30);
    expect(half.next.min).toBeCloseTo(18);
    expect(half.last.nm).toBeCloseTo(90);
    expect(half.burntGal).toBeCloseTo(2.5);
    const on = dryRunFlown(run, 1_000 + 54 * 60)!;
    expect(on.hop).toBe(1);
    expect(on.next.nm).toBeCloseTo(30);
    expect(on.burntGal).toBeCloseTo(2.5);
  });

  it("is in at the destination at the end, nothing left", () => {
    const end = dryRunFlown(run, 9_999_999)!;
    expect(end).toMatchObject({ hop: 1, next: { nm: 0, min: 0 }, last: { nm: 0, min: 0 } });
  });
});

describe("a hold the pilot put on the route", () => {
  // Over the destination before it lands, two turns of a lap of four
  // minutes, a racetrack a few miles east of the field: eight minutes and
  // a gallon more in the leg's time and fuel, as the planner adds them.
  const lap = [
    [43, -88],
    [43.02, -87.98],
    [43.02, -87.9],
    [43, -87.92],
    [43, -88],
  ];
  const held = {
    ...leg,
    ete_min: 36 + 8,
    fuel_gal: 6,
    hold: {
      fix: "KDLH",
      inbound_deg: 270,
      right: true,
      leg_min: 1,
      leg_nm: null,
      turns: 2,
      minutes: 8,
      lap_min: 4,
      gal: 1,
      entry: "direct",
      path: lap,
      at_end: true,
    },
  } as Leg;
  const holding = navLogRows({ departure: airport("C81", 42, 800), destination: airport("KDLH", 43, 500) }, [], [held]);
  const run = dryRunOf(holding, 1_000);

  it("flies round the racetrack twice before it lands, in the planner's time and fuel", () => {
    const last = run.points.at(-1)!;
    expect(last.t).toBeCloseTo(1_000 + 44 * 60);
    expect(run.fuelGal.at(-1)).toBeCloseTo(6);
    // East of the field in the hold, and at the field when it is over.
    expect(Math.max(...run.points.map((p) => p.lon))).toBeGreaterThan(-87.95);
    expect(last).toMatchObject({ lat: 43, lon: -88 });
  });
});
