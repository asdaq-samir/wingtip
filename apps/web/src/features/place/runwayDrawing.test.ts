import { describe, expect, test } from "vitest";
import type { Runway } from "../../lib/api/types";
import { callEngine, type EngineInput } from "../../lib/engine/engine";
import fixture from "../../lib/fixtures/runwaySketch.json";
import { sketchOf } from "./runwayDrawing";

const stripsOf = (runways: Runway[], lat: number, lon: number) => sketchOf(runways, lat, lon).strips;

const runway = (ends: [string, number | null, number | null, number | null][], extra: Partial<Runway> = {}): Runway => ({
  ends: ends.map((e) => e[0]).join("/"),
  length_ft: 6000,
  width_ft: 150,
  surface: "ASP",
  lighted: true,
  closed: false,
  runway_ends: ends.map(([ident, heading, lat, lon]) => ({ ident, heading_true_deg: heading, traffic: "left", lat, lon })),
  turf: [],
  ...extra,
});

describe("the runways' sketch", () => {
  test("is the engine's layout of the shared cases (runway_sketch)", () => {
    for (const c of fixture.cases) {
      expect(callEngine("runway_sketch", c.input as EngineInput<"runway_sketch">), c.about).toEqual(c.answer);
    }
  });

  test("draws the engine's strips with each runway's ends, closures and the count left out", () => {
    const known = runway([
      ["18", 180, 43.01, -89],
      ["36", 0, 43, -89],
    ]);
    const unknown = runway([
      ["9", 90, null, null],
      ["27", 270, null, null],
    ]);
    const { strips, leftOut } = sketchOf([known, { ...unknown, closed: true }], 43, -89);
    expect(strips.map((s) => s.ends)).toEqual([["18", "36"]]);
    expect(strips[0]!.a[1]).toBeCloseTo(0.6);
    expect(leftOut).toBe(1);
    const [guessed] = sketchOf([{ ...unknown, closed: true, notams: ["!ABC RWY 09/27 CLSD"] }], 43, -89).strips;
    expect(guessed).toMatchObject({ ends: ["9", "27"], closed: true, permanent: true, notams: ["!ABC RWY 09/27 CLSD"] });
  });

  test("marks a runway's turf from whichever end the remarks measure it, and all of a turf runway", () => {
    const ends: [string, number, number, number][] = [
      ["06", 58, 42.3226, -88.0797],
      ["24", 238, 42.3277, -88.0685],
    ];
    // C81's 06/24: the south-west 1,000 of its 3,573 ft, from 06's end.
    const [c81] = stripsOf(
      [runway(ends, { length_ft: 3573, surface: "ASPH-TURF", turf: [{ end: "06", from_ft: 0, to_ft: 1000 }] })],
      42.3246,
      -88.0741,
    );
    expect(c81!.turf).toEqual([[0, 1000 / 3573]]);
    // From the second end, the rest of it: the way back from it.
    const [rest] = stripsOf([runway(ends, { length_ft: 4000, turf: [{ end: "24", from_ft: 1000, to_ft: null }] })], 42.3246, -88.0741);
    expect(rest!.turf).toEqual([[0, 0.75]]);
    const [grass] = stripsOf([runway(ends, { surface: "TURF-G" })], 42.3246, -88.0741);
    expect(grass!.turf).toEqual([[0, 1]]);
    const [paved] = stripsOf([runway(ends, { surface: "ASPH-TURF" })], 42.3246, -88.0741);
    expect(paved!.turf).toEqual([]);
    // A remark longer than the published length ends on the end, not past it.
    const [past] = stripsOf([runway(ends, { length_ft: 3000, turf: [{ end: "24", from_ft: 2500, to_ft: 3400 }] })], 42.3246, -88.0741);
    expect(past!.turf).toEqual([[0, 1 - 2500 / 3000]]);
  });

  test("draws nothing for a helipad or a runway with neither", () => {
    expect(stripsOf([runway([["H1", null, null, null]])], 43, -89)).toEqual([]);
    expect(
      stripsOf(
        [
          runway([
            ["9", null, null, null],
            ["27", null, null, null],
          ]),
        ],
        43,
        -89,
      ),
    ).toEqual([]);
  });
});
