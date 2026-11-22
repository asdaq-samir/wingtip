import { describe, expect, it } from "vitest";
import { middleOf } from "./diagramText";

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
