import { describe, expect, it } from "vitest";
import { joinRuns, middleOf } from "./diagramText";

describe("a text run's middle", () => {
  it("is half its length along it and half its height up it, level", () => {
    // "46°51'N" set level at (100, 500), 30 long and 8 high.
    expect(middleOf({ str: "46°51'N", transform: [8, 0, 0, 8, 100, 500], width: 30, height: 8 })).toEqual([115, 504]);
  });

  it("turns with a run set up the page, as a turned diagram's labels are", () => {
    // Up the page (direction 0, 1): along is up, its height to the left.
    const [x, y] = middleOf({ str: "92°13'W", transform: [0, 8, -8, 0, 300, 100], width: 30, height: 8 });
    expect(x).toBeCloseTo(296);
    expect(y).toBeCloseTo(115);
  });
});

describe("a diagram's runs joined into its words", () => {
  // Up the page (direction 0, 1), 4.7 high, as pdf.js gives KDLH's 2611
  // diagram's 92°11'W: a glyph group a run, 1 to 3 points apart.
  const up = (str: string, y: number, width: number) => ({ str, transform: [0, 11.7, -4.7, 0, 363, y], width, height: 4.7 });
  it("joins a turned label's pieces into the label the engine reads", () => {
    const runs = [up("92", 160, 5), up("°", 166.1, 1.9), up("11", 170.1, 5), up("'", 176.1, 1), up("W", 180.1, 4)];
    const [label, ...rest] = joinRuns(runs);
    expect(rest).toEqual([]);
    expect(label!.str).toBe("92°11'W");
    expect(label!.width).toBeCloseTo(24.1);
  });

  it("keeps apart words far apart or turned another way, and words a space apart keep the space", () => {
    const level = (str: string, x: number) => ({ str, transform: [8, 0, 0, 8, x, 500], width: 10, height: 8 });
    expect(joinRuns([up("92", 160, 5), up("W", 200, 4)]).map((r) => r.str)).toEqual(["92", "W"]);
    expect(joinRuns([up("92", 160, 5), level("W", 363)]).map((r) => r.str)).toEqual(["92", "W"]);
    expect(joinRuns([level("ELEV", 100), level(" ", 110), level("1428", 113)]).map((r) => r.str)).toEqual(["ELEV 1428"]);
  });
});
