import { describe, expect, it } from "vitest";
import fixture from "../../lib/fixtures/replay.json";
import { alongAt, gapAt, readyTrack, sampleAt } from "./track";

// The shared climb and gap (lib/fixtures/replay.json), which the engine's
// contract test reads too.
const { input, gapAfter, gapUntil, climbFpmNear, levelFpm } = fixture.climbThenGap;
const track = readyTrack(input.points, { id: "test", label: "Test", altitude: "pressure", credit: null });

describe("a recorded flight made ready to replay", () => {
  it("marks two minutes unheard as a gap and lists it", () => {
    expect(track.gaps).toEqual([{ from: gapAfter, to: gapUntil }]);
    expect(track.points.find((p) => p.t === gapUntil)?.gap).toBe(true);
  });

  it("reads the climb through the transponder's 25 ft steps, and level after", () => {
    expect(track.points[3]!.vs_fpm!).toBeCloseTo(climbFpmNear, -2);
    expect(track.points.at(-1)!.vs_fpm).toBe(levelFpm);
  });

  it("shows no airplane inside a gap, rather than a straight line over it", () => {
    const mid = (gapAfter + gapUntil) / 2;
    expect(gapAt(track, mid)).toEqual({ from: gapAfter, to: gapUntil });
    expect(sampleAt(track.points, mid)).toBeNull();
    // Either side of it, the reports themselves.
    expect(sampleAt(track.points, gapAfter)?.alt_ft).not.toBeNull();
    expect(sampleAt(track.points, gapUntil)?.lat).toBeCloseTo(45.06, 3);
  });

  it("says how far along the flight a moment is, between two reports", () => {
    const a = track.points[0]!,
      b = track.points[1]!;
    expect(alongAt(track.points, (a.t + b.t) / 2)).toBeCloseTo((a.along_nm + b.along_nm) / 2, 6);
    expect(alongAt(track.points, (gapAfter + gapUntil) / 2)).toBeNull();
  });
});
