import { describe, expect, it } from "vitest";
import type { ChartInfo } from "../../api/types";
import type { AirspaceVolume } from "../sources/overlayTypes";
import type { LineLayerSpecification } from "maplibre-gl";
import {
  absoluteTiles,
  airspaceLayers,
  airspaceText,
  OVERLAY_SOURCE,
  chartPaint,
  chartStyle,
  DAY_CONTRAST,
  DAY_SATURATION,
  glZoom,
  legPiece,
  routeFeature,
  routeLayers,
  selectedLegFilter,
  specialUseLayers,
} from "./glStyle";
import { CLOSE_MAX_ZOOM, chartFade, imageryFade, imageryFrom } from "./closeZoom";

const chart = {
  chart_cycle: "10-29-2026",
  chart_revision: 6,
  chart_tiles_base: null,
  chart_layers: [
    { kind: "sec", label: "Sectional", min_zoom: 3, max_zoom: 12, base: true, over: [], sheets: [], cycle: "10-29-2026", revision: 6 },
    {
      kind: "tac",
      label: "Terminal area",
      min_zoom: 10,
      max_zoom: 13,
      base: false,
      over: ["sec"],
      sheets: [],
      cycle: "10-29-2026",
      revision: 6,
    },
  ],
} as unknown as ChartInfo;

describe("chartStyle", () => {
  it("asks for the chart's tiles at the chart's own zooms", () => {
    const style = chartStyle(chart, "sec", false, "https://wingtip.test")!;
    expect(style.sources.chart!.tiles).toEqual(["https://wingtip.test/api/planner/chart-tile/sec/{z}/{x}/{y}.png?c=10-29-2026&r=6"]);
    expect(style.sources.chart).toMatchObject({ minzoom: 3, maxzoom: 12, tileSize: 256 });
    // The region's level under it, while the chart's own tiles come in.
    expect(style.sources["chart-under"]).toMatchObject({ minzoom: 5, maxzoom: 5 });
    // Two levels past the chart's last, in MapLibre's zoom (the app's less
    // one), where there is no imagery to fade into.
    expect(style.maxZoom).toBe(13);
    expect(style.layers.map((l) => l.id)).toEqual(["chart-under", "chart"]);
  });

  it("fades the chart out over one level past its own last zoom, into the imagery under it", () => {
    // The sectional's tiles end at {z} 12, MapLibre's 11: whole there,
    // gone at 12, the imagery whole before the chart starts to go.
    expect(chartFade(12)).toEqual(["interpolate", ["linear"], ["zoom"], 11, 1, 12, 0]);
    expect(imageryFade(12)).toEqual(["interpolate", ["linear"], ["zoom"], 10.5, 0, 11, 1]);
    expect(imageryFrom(12)).toBe(10.5);
    // A TAC (13) a level later, IFR low (11) a level sooner.
    expect(chartFade(13)).toEqual(["interpolate", ["linear"], ["zoom"], 12, 1, 13, 0]);
    expect(chartFade(11)).toEqual(["interpolate", ["linear"], ["zoom"], 10, 1, 11, 0]);
    expect(CLOSE_MAX_ZOOM).toBe(17);
  });

  it("puts the terminal sheet over the chart only while pinned", () => {
    const style = chartStyle(chart, "sec", true, "https://wingtip.test")!;
    expect(style.layers.map((l) => l.id)).toEqual(["chart-under", "chart", "chart-terminal"]);
    expect(style.layers[2]!.minzoom).toBe(glZoom(10));
  });

  it("lifts the chart's contrast and colour by day, leaving the night and the sunlight as they were", () => {
    expect(chartPaint(false, false)).toMatchObject({ "raster-contrast": DAY_CONTRAST, "raster-saturation": DAY_SATURATION });
    expect([DAY_CONTRAST, DAY_SATURATION]).toEqual([0.1, 0.1]);
    expect(chartPaint(true, false)).toMatchObject({ "raster-contrast": 0.13, "raster-saturation": 0, "raster-brightness-max": 0.5 });
    expect(chartPaint(false, true)).toMatchObject({ "raster-contrast": 0.2, "raster-saturation": 0.2 });
  });

  it("leaves a CDN's address as it is, and keeps the braces", () => {
    expect(absoluteTiles("https://cdn.test/c/sec/{z}/{x}/{y}.png?r=1", "https://wingtip.test")).toBe(
      "https://cdn.test/c/sec/{z}/{x}/{y}.png?r=1",
    );
  });
});

describe("airspaceLayers", () => {
  const volume = {
    id: "ORD-B-1",
    airspace_class: "B",
    floor_ft: 3000,
    floor_sfc: false,
    ceiling_ft: 10000,
    ceiling_excluded: false,
  } as unknown as AirspaceVolume;

  it("writes a volume's floor and ceiling in feet MSL, as ForeFlight's tab does", () => {
    expect(airspaceText(volume)).toBe("B: 3000–10000");
    // Madison's Class C shelf (the owner's ForeFlight screenshot).
    expect(airspaceText({ ...volume, airspace_class: "C", floor_ft: 2300, ceiling_ft: 4900 })).toBe("C: 2300–4900");
    expect(airspaceText({ ...volume, airspace_class: "D", floor_ft: 0, floor_sfc: true, ceiling_ft: 2500 })).toBe("D: SFC–2500");
    expect(airspaceText({ ...volume, ceiling_ft: null })).toBeNull();
  });

  it("draws the tiles' rings each with its band along the inside, Class E left out", () => {
    const layers = airspaceLayers(["Inter"]);
    expect(layers.map((l) => l.id)).toEqual([
      "airspace-D-band",
      "airspace-D",
      "airspace-C-band",
      "airspace-C",
      "airspace-B-band",
      "airspace-B",
      "airspace-labels",
    ]);
    expect(layers.every((l) => "source" in l && l.source === OVERLAY_SOURCE)).toBe(true);
    const band = layers.find((l) => l.id === "airspace-C-band") as LineLayerSpecification;
    // Inwards, wider as the map comes in, the line's own ink faint.
    expect(band.paint).toMatchObject({ "line-color": "#e02ad8", "line-opacity": 0.3 });
    const offset = band.paint!["line-offset"] as unknown as (string | number)[];
    expect(offset.slice(3).filter((_, i) => i % 2 === 1)).toEqual([3, 4.5, 6.5, 9.5]);
  });

  it("draws the special-use areas' lines and hatched bands, restricted orange-brown and MOAs magenta", () => {
    const [band, line] = specialUseLayers();
    expect(band!.paint!["line-pattern"]).toEqual([
      "case",
      ["in", ["get", "type"], ["literal", ["P", "R", "W", "D"]]],
      "sua|hatch|restricted",
      "sua|hatch|moa",
    ]);
    expect(line!.paint!["line-color"]).toEqual(["case", ["in", ["get", "type"], ["literal", ["P", "R", "W", "D"]]], "#e0662a", "#e02ad8"]);
    expect(band!["source-layer"]).toBe("special_use");
  });

  it("draws each class from its own zoom, the labels from 8", () => {
    const layers = airspaceLayers(["Inter"]);
    const from = Object.fromEntries(layers.map((l) => [l.id, l.minzoom]));
    expect(from).toMatchObject({
      "airspace-B": glZoom(6),
      "airspace-B-band": glZoom(6),
      "airspace-C": glZoom(7),
      "airspace-D": glZoom(8),
      "airspace-labels": glZoom(8),
    });
  });
});

describe("the course's casing", () => {
  const line: [number, number][] = [
    [45, -93],
    [45.5, -93],
    [46, -93],
    [46, -92],
  ];
  const legs = [
    { key: "a", from: { lat: 45, lon: -93 }, to: { lat: 45.5, lon: -93 } },
    { key: "b", from: { lat: 45.5, lon: -93 }, to: { lat: 46, lon: -92 } },
  ];

  it("is green only along the selected leg, none while no leg is", () => {
    const layers = routeLayers();
    const by = Object.fromEntries(layers.map((l) => [l.id, l as LineLayerSpecification]));
    // No green on the whole route: the core and its thin edge show it all.
    expect(by["route-core"]!.filter).toEqual(["==", ["get", "part"], "route"]);
    expect(by["route-edge"]!.filter).toEqual(["==", ["get", "part"], "route"]);
    // The casing and the edge that frames it wait for a selected leg.
    expect(by["route-casing"]!.filter).toEqual(selectedLegFilter(null));
    expect(by["route-outer"]!.filter).toEqual(selectedLegFilter(null));
    expect(selectedLegFilter("b")).toEqual(["all", ["==", ["get", "part"], "leg"], ["==", ["get", "leg"], "b"]]);
    expect(layers.map((l) => l.id)).toEqual(["route-outer", "route-edge", "route-casing", "route-core"]);
  });

  it("gives each leg its own piece of the course to be cased", () => {
    const { features } = routeFeature(line, legs);
    expect(features.map((f) => f.properties)).toEqual([{ part: "route" }, { part: "leg", leg: "a" }, { part: "leg", leg: "b" }]);
    expect(features[1]!.geometry.coordinates).toEqual([
      [-93, 45],
      [-93, 45.5],
    ]);
    // The second leg runs on through the vertex the line turns at.
    expect(features[2]!.geometry.coordinates).toEqual([
      [-93, 45.5],
      [-93, 46],
      [-92, 46],
    ]);
    // A leg with no length has nothing to case.
    expect(legPiece(line, { lat: 45, lon: -93 }, { lat: 45, lon: -93 })).toBeNull();
  });
});
