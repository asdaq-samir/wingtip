import { describe, expect, test } from "vitest";
import { CHART } from "../../../../lib/tokens";
import { skyOf } from "./sky";

describe("the 3D view's sky", () => {
  test("is the chart's pale blue by day and its dark tokens over the dimmed chart at night", () => {
    expect(skyOf(false)).toMatchObject({ "sky-color": CHART.sky, "horizon-color": CHART.skyHorizon, "fog-color": CHART.skyHorizon });
    expect(skyOf(true)).toMatchObject({
      "sky-color": CHART.skyNight,
      "horizon-color": CHART.skyHorizonNight,
      "fog-color": CHART.skyHorizonNight,
    });
  });
});
