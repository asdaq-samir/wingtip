import { describe, expect, it } from "vitest";
import { dryRunNext, gpsAhead } from "./flyingTo";
import type { DryRun } from "./dryRun";
import type { NavLogRow } from "./navLogRows";

// East along the equator, a degree each leg (60.108 nm on WGS-84, the
// shared fixture inFlight.json's route): the departure, a top of climb on
// the first leg, a checkpoint and the destination.
const field = (ident: string, lon: number) => ({ ident, name: ident, lat: 0, lon });
const rows = [
  { kind: "departure", key: "departure", airport: field("AAA", 0), minutesFlown: 0 },
  { kind: "toc", key: "toc", point: { lat: 0, lon: 0.3 } },
  { kind: "checkpoint", key: "cp", cp: { name: "Lake", category: "lake", lat: 0, lon: 1 } },
  { kind: "destination", key: "destination", airport: field("BBB", 2) },
] as unknown as NavLogRow[];
const line: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
];

describe("own ship's next checkpoint from the GPS (the engine's in_flight)", () => {
  it("is the checkpoint ahead along the line, not a top of climb, timed at the ground speed", () => {
    const next = gpsAhead(rows, line, { lat: 0, lon: 0.5, headingDeg: 90, speedKt: 120, at: 0 })!;
    expect(next.index).toBe(2);
    expect(next.nm).toBeCloseTo(30.05, 1);
    expect(next.min).toBeCloseTo((next.nm / 120) * 60, 9);
    expect(next.at).toBeCloseTo(next.min! * 60, 6);
  });

  it("moves on once the airplane is past it along the line", () => {
    expect(gpsAhead(rows, line, { lat: 0, lon: 1.2, headingDeg: 90, speedKt: 120, at: 0 })!.index).toBe(3);
  });

  it("gives no time below flying speed, and nothing with no line", () => {
    const slow = gpsAhead(rows, line, { lat: 0, lon: 0.5, headingDeg: null, speedKt: 10, at: 0 })!;
    expect(slow.min).toBeNull();
    expect(slow.at).toBeNull();
    expect(gpsAhead(rows, null, { lat: 0, lon: 0.5, headingDeg: 90, speedKt: 120, at: 0 })).toBeNull();
  });

  it("says whether the airplane is on the route as the engine does, so the head drops its next checkpoint off it", () => {
    // On the line at flying speed; a tenth of a degree north of it (6 nm);
    // on the line but below flying speed: the engine's on_route, not a
    // distance of the web's own.
    expect(gpsAhead(rows, line, { lat: 0, lon: 0.5, headingDeg: 90, speedKt: 120, at: 0 })!.onRoute).toBe(true);
    expect(gpsAhead(rows, line, { lat: 0.1, lon: 0.5, headingDeg: 90, speedKt: 120, at: 0 })!.onRoute).toBe(false);
    expect(gpsAhead(rows, line, { lat: 0, lon: 0.5, headingDeg: null, speedKt: 10, at: 0 })!.onRoute).toBe(false);
  });
});

describe("the dry run's next checkpoint", () => {
  // A run along the four rows: at each row by its time, 0, 6, 30 and 60 min.
  const run = { rows, rowT: [0, 360, 1800, 3600], bends: [], points: [], alongNm: [], fuelGal: [], landings: [] } as unknown as DryRun;

  it("is read against the rows the run was flown along, whatever list the page holds then", () => {
    // Between the top of climb and the checkpoint: the checkpoint next,
    // not the top of climb. The page's nav log may be the route as entered
    // for a moment, its two ends alone, while a plan is asked again: read
    // against that, the index named no checkpoint and the flying head
    // went (emergency.spec on CI, run 45127491141).
    expect(dryRunNext(run, 600)).toBe(2);
    expect(dryRunNext(run, 2000)).toBe(3);
  });
});
