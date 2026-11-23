import { describe, expect, it } from "vitest";
import { chartTileMissed } from "./useChartMissed";

describe("a chart tile missed with no connection", () => {
  it("is a chart source's tile that failed while offline", () => {
    expect(chartTileMissed({ sourceId: "chart:sec", tile: {} }, false)).toBe(true);
    expect(chartTileMissed({ sourceId: "chart-terminal:tac", tile: {} }, false)).toBe(true);
  });

  it("is not one that failed online, another source's, or an error with no tile", () => {
    expect(chartTileMissed({ sourceId: "chart:sec", tile: {} }, true)).toBe(false);
    expect(chartTileMissed({ sourceId: "close-imagery", tile: {} }, false)).toBe(false);
    expect(chartTileMissed({ sourceId: "chart:sec" }, false)).toBe(false);
  });
});
