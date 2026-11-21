import type { ExpressionSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { CHART, MAP_LABEL, type MapLabelKind } from "../../../tokens";
import { rgbOf } from "../../../rgb";
import { airspaceLayers } from "../glStyle";
import { suaTabLayout } from "../glSuaLabels";
import { GL_FONT, GL_FONT_BOLD, LABEL_HALO, labelHalo, labelInk, labelScale, labelText, type LabelKind } from "./common";

// The labels' scale as every size reads it (LABEL_SCALE, 1 unless set).
const S = ["coalesce", ["global-state", "labelScale"], 1];
const NIGHT = ["boolean", ["global-state", "labelNight"], false];

describe("the map's words (map.label)", () => {
  it("letter a kind at its size by zoom, the token's zooms the app's levels", () => {
    // The app's zoom 4 is MapLibre's 3 (glZoom).
    expect(labelText("airportIdent")).toEqual({
      "text-font": GL_FONT_BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, ["*", 11, S], 9, ["*", 12, S], 12, ["*", 13, S]],
    });
    expect(labelText("checkpointName")).toEqual({ "text-font": GL_FONT, "text-size": ["*", 12, S] });
  });

  it("give each kind its halo, one width for light and dark", () => {
    expect(labelHalo("airportIdent")).toBe(LABEL_HALO);
    expect(labelHalo("runwayNumber")).toEqual({ "text-halo-color": CHART.tag, "text-halo-width": MAP_LABEL.halo });
    expect(labelHalo("airspaceTab")).toEqual({});
  });

  it("never go under the floor, map.label.size-small", () => {
    for (const kind of Object.keys(MAP_LABEL.kind) as LabelKind[]) {
      const size: MapLabelKind["size"] = MAP_LABEL.kind[kind].size;
      const sizes = typeof size === "number" ? [size] : size.map(([, px]) => px);
      expect(Math.min(...sizes), kind).toBeGreaterThanOrEqual(MAP_LABEL.size.small);
    }
  });

  it("letter the Class tabs and the special-use tabs alike", () => {
    const tab = airspaceLayers(GL_FONT_BOLD).find((l) => l.id === "airspace-labels")!;
    const sua = suaTabLayout(GL_FONT_BOLD);
    const layout = (tab as { layout: Record<string, unknown> }).layout;
    for (const key of ["text-size", "text-line-height", "icon-text-fit-padding", "text-padding"] as const)
      expect(sua[key], key).toEqual(layout[key]);
  });

  it("grow with the pilot's text size only with Larger Map Labels on, at most map.label.scale-max", () => {
    expect(labelScale(false, 19.65)).toBe(1);
    expect(labelScale(true, 16)).toBe(1);
    expect(labelScale(true, 17.88)).toBeCloseTo(1.1175);
    expect(labelScale(true, 19.65)).toBe(MAP_LABEL.scaleMax);
    expect(labelScale(true, 14)).toBe(1);
    expect(labelScale(true, Number.NaN)).toBe(1);
  });

  it("turn a light-haloed word's ink light after dark, on the dark halo", () => {
    expect(labelInk(CHART.towered)).toEqual(["case", NIGHT, MAP_LABEL.nightInk[CHART.towered], CHART.towered]);
    // A colour with no night ink keeps its own (a VOR's white on its tag).
    expect(labelInk(CHART.casing)).toEqual(["case", NIGHT, CHART.casing, CHART.casing]);
    const get: ExpressionSpecification = ["get", "ink"];
    const ink = labelInk(get) as unknown[];
    expect(ink[2]).toEqual(["match", get, ...Object.entries(MAP_LABEL.nightInk).flat(), get]);
    expect(LABEL_HALO["text-halo-color"]).toEqual(["case", NIGHT, `${CHART.tag}${Math.round(MAP_LABEL.haloNight * 255).toString(16)}`, CHART.casing]);
  });

  it("give every day ink of a light-haloed kind its night ink, at 4.5:1 or more on the night's halo", () => {
    for (const day of [CHART.towered, CHART.untowered, CHART.vfrGreenText, CHART.fixInk, CHART.tfr, CHART.warning])
      expect(MAP_LABEL.nightInk[day], day).toBeDefined();
    // The night's halo at its lightest: the tag at halo-night over an
    // undimmed white chart (WCAG 2.x relative luminance).
    const lum = (rgb: readonly number[]) => {
      const [r, g, b] = rgb.map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const a = MAP_LABEL.haloNight;
    const halo = rgbOf(CHART.tag).map((v) => v * a + 255 * (1 - a));
    for (const night of Object.values(MAP_LABEL.nightInk)) expect((lum(rgbOf(night)) + 0.05) / (lum(halo) + 0.05), night).toBeGreaterThanOrEqual(4.5);
  });
});
