import type { ExpressionSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { CHART, MAP_LABEL, type MapLabelKind } from "../../../tokens";
import { luminanceOf } from "../../../rgb";
import { OVERLAY_LINES } from "../../../generated/overlayLayers";
import { suaTabLayout } from "../glSuaLabels";
import { GL_FONT, GL_FONT_BOLD, LABEL_HALO, labelHalo, labelInk, labelScale, labelText, type LabelKind } from "./common";

// The labels' scale as every size reads it (LABEL_SCALE, 1 unless set).
const S = ["coalesce", ["global-state", "labelScale"], 1];
const LIGHT = ["number", ["global-state", "labelNight"], 0];
const NIGHT = [">", LIGHT, 0];

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
    const tab = OVERLAY_LINES.find((l) => l.id === "airspace-labels")!;
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

  it("turn a light-haloed word's ink light after dark, at the words' light, on the whole dark halo", () => {
    // The towered blue, the inks' light, as it is; at the words' light.
    expect(labelInk(CHART.towered)).toEqual([
      "case",
      NIGHT,
      ["interpolate", ["linear"], LIGHT, 0, "black", 1, MAP_LABEL.nightInk[CHART.towered]],
      CHART.towered,
    ]);
    // A colour with no night ink keeps its own (a VOR's white on its tag).
    expect(night(CHART.casing)).toBe(CHART.casing);
    const get: ExpressionSpecification = ["get", "ink"];
    const match = ((labelInk(get) as unknown[])[2] as unknown[])[6] as unknown[];
    expect(match[0]).toBe("match");
    expect(match[1]).toEqual(get);
    expect(LABEL_HALO["text-halo-color"]).toEqual(["case", NIGHT, CHART.tag, CHART.casing]);
  });

  it("bring every night ink no lighter than the towered blue, so no word outshines the paper", () => {
    for (const day of [CHART.towered, CHART.untowered, CHART.vfrGreenText, CHART.fixInk, CHART.tfr, CHART.warning])
      expect(MAP_LABEL.nightInk[day], day).toBeDefined();
    const blue = luminanceOf(MAP_LABEL.nightInk[CHART.towered]!);
    for (const day of Object.keys(MAP_LABEL.nightInk)) {
      const ink = night(day);
      expect(luminanceOf(ink), day).toBeLessThanOrEqual(blue + 0.005);
    }
  });
});

/** The night ink labelInk sets for a day ink, before the words' light. */
function night(day: string): string {
  return ((labelInk(day) as unknown[])[2] as unknown[])[6] as string;
}
