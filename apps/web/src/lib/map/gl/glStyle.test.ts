import { describe, expect, it } from "vitest";
import type { ChartInfo } from "../../api/types";
import type { AirspaceVolume } from "../overlayTypes";
import { absoluteTiles, airspaceLayers, airspaceText, OVERLAY_SOURCE, chartPaint, chartStyle, DAY_CONTRAST, DAY_SATURATION, glZoom } from "./glStyle";

const chart = {
  chart_cycle: "10-29-2026", chart_revision: 6, chart_tiles_base: null,
  chart_layers: [
    { kind: "sec", label: "Sectional", min_zoom: 3, max_zoom: 12, base: true, over: [], sheets: [], cycle: "10-29-2026", revision: 6 },
    { kind: "tac", label: "Terminal area", min_zoom: 10, max_zoom: 13, base: false, over: ["sec"], sheets: [], cycle: "10-29-2026", revision: 6 },
  ],
} as unknown as ChartInfo;

describe("chartStyle", () => {
  it("asks for the chart's tiles at the chart's own zooms", () => {
    const style = chartStyle(chart, "sec", false, "https://wingtip.test")!;
    expect(style.sources.chart!.tiles).toEqual(["https://wingtip.test/api/planner/chart-tile/sec/{z}/{x}/{y}.png?c=10-29-2026&r=6"]);
    expect(style.sources.chart).toMatchObject({ minzoom: 3, maxzoom: 12, tileSize: 256 });
    // The region's level under it, while the chart's own tiles come in.
    expect(style.sources["chart-under"]).toMatchObject({ minzoom: 5, maxzoom: 5 });
    // Two levels past the chart's last, in MapLibre's zoom (the app's less one).
    expect(style.maxZoom).toBe(13);
    expect(style.layers.map(l => l.id)).toEqual(["chart-under", "chart"]);
  });

  it("puts the terminal sheet over the chart only while pinned", () => {
    const style = chartStyle(chart, "sec", true, "https://wingtip.test")!;
    expect(style.layers.map(l => l.id)).toEqual(["chart-under", "chart", "chart-terminal"]);
    expect(style.layers[2]!.minzoom).toBe(glZoom(10));
  });

  it("lifts the chart's contrast and colour by day, leaving the night and the sunlight as they were", () => {
    expect(chartPaint(false, false)).toMatchObject({ "raster-contrast": DAY_CONTRAST, "raster-saturation": DAY_SATURATION });
    expect([DAY_CONTRAST, DAY_SATURATION]).toEqual([0.1, 0.1]);
    expect(chartPaint(true, false)).toMatchObject({ "raster-contrast": 0.13, "raster-saturation": 0, "raster-brightness-max": 0.5 });
    expect(chartPaint(false, true)).toMatchObject({ "raster-contrast": 0.2, "raster-saturation": 0.2 });
  });

  it("leaves a CDN's address as it is, and keeps the braces", () => {
    expect(absoluteTiles("https://cdn.test/c/sec/{z}/{x}/{y}.png?r=1", "https://wingtip.test")).toBe("https://cdn.test/c/sec/{z}/{x}/{y}.png?r=1");
  });
});

describe("airspaceLayers", () => {
  const volume = {
    id: "ORD-B-1", airspace_class: "B", floor_ft: 3000, floor_sfc: false, ceiling_ft: 10000, ceiling_excluded: false,
  } as unknown as AirspaceVolume;

  it("writes a volume's altitudes as the chart's tab does", () => {
    expect(airspaceText(volume)).toBe("B: 100–30");
  });

  it("draws the tiles' rings, Class E left out", () => {
    const layers = airspaceLayers(["Inter"]);
    expect(layers.map(l => l.id)).toEqual(["airspace-D", "airspace-C", "airspace-B", "airspace-labels"]);
    expect(layers.every(l => "source" in l && l.source === OVERLAY_SOURCE)).toBe(true);
  });

  it("draws each class from its own zoom, the labels from 8", () => {
    const layers = airspaceLayers(["Inter"]);
    const from = Object.fromEntries(layers.map(l => [l.id, l.minzoom]));
    expect(from).toMatchObject({ "airspace-B": glZoom(6), "airspace-C": glZoom(7), "airspace-D": glZoom(8), "airspace-labels": glZoom(8) });
  });
});
