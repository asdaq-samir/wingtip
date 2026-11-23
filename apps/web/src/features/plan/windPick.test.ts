import { describe, expect, test } from "vitest";
import type { Runway } from "../../lib/api/types";
import { windPick } from "./pattern";

/** A runway of two ends at their true headings, as the planner sends one. */
function runway(ends: [string, number][], lengthFt: number, wind?: Runway["wind"]): Runway {
  return {
    closed: false,
    ends: ends.map((e) => e[0]).join("/"),
    length_ft: lengthFt,
    lighted: true,
    surface: "ASP",
    turf: [],
    width_ft: 75,
    runway_ends: ends.map(([ident, heading]) => ({ ident, heading_true_deg: heading, traffic: "left" })),
    wind: wind ?? null,
  } as Runway;
}

// C81's two runways, their ends' true headings near enough.
const C81 = [
  runway(
    [
      ["06", 58],
      ["24", 238],
    ],
    3573,
  ),
  runway(
    [
      ["09", 88],
      ["27", 268],
    ],
    3270,
  ),
];

// Which runway the wind favours, calm, variable and a forecast's are the
// engine's, each case tested there (engine/facade/tests/runway/pick_cases.rs):
// here, that the report's wind reaches "wind_pick" and each field of the
// answer, the ones only some answers carry too, is read into the pick.
describe("windPick", () => {
  test("a field with no report of its own goes by the nearest report's wind, said as that station's", () => {
    // KUGN's 220° at 8 kt: 18° off 24, 48° off 27.
    const pick = windPick(C81, { station: "KUGN", distanceNm: 11.1, dirTrueDeg: 220, speedKt: 8, gustKt: 15 });
    expect(pick).toEqual({
      ident: "24",
      headwindKt: Math.round(8 * Math.cos((18 * Math.PI) / 180)),
      crosswindKt: Math.round(8 * Math.sin((-18 * Math.PI) / 180)),
      gustCrosswindKt: Math.round(15 * Math.sin((-18 * Math.PI) / 180)),
      calm: false,
      from: { ident: "KUGN", nm: 11 },
    });
  });

  test("calm on the runway in use, and a variable wind, are said as such; no wind picks none", () => {
    // Calm at the field, its last wind on 27: the runway in use.
    const kept = [
      runway(
        [
          ["06", 58],
          ["24", 238],
        ],
        3573,
        { end: "06", headwind_kt: 0, crosswind_kt: 0, gust_crosswind_kt: null },
      ),
      runway(
        [
          ["09", 88],
          ["27", 268],
        ],
        3270,
        { end: "27", headwind_kt: 0, crosswind_kt: 0, gust_crosswind_kt: null, in_use: true },
      ),
    ];
    expect(windPick(kept)).toMatchObject({ ident: "27", calm: true, inUse: true });
    // A variable wind has no direction to land into: as calm, said as variable.
    expect(windPick(C81, { station: "KUGN", distanceNm: 11, dirTrueDeg: null, speedKt: 6, gustKt: null })).toMatchObject({
      ident: "6",
      calm: true,
      variableKt: 6,
      from: { ident: "KUGN", nm: 11 },
    });
    expect(windPick(C81, null)).toBeNull();
  });

  test("a forecast's wind is said as the forecast, at its time", () => {
    const at = 1_790_000_000;
    expect(windPick(C81, { station: "KRFD", distanceNm: 21.4, dirTrueDeg: 270, speedKt: 10, gustKt: null }, at)).toMatchObject({
      ident: "27",
      from: { ident: "KRFD", nm: 21 },
      forecastAt: at,
    });
  });
});
