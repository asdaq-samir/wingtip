import { describe, expect, it } from "vitest";
import { CHART, MAP_LABEL, type MapLabelKind } from "../../../tokens";
import { airspaceLayers } from "../glStyle";
import { suaTabLayout } from "../glSuaLabels";
import { GL_FONT, GL_FONT_BOLD, LABEL_HALO, labelHalo, labelText, type LabelKind } from "./common";

describe("the map's words (map.label)", () => {
  it("letter a kind at its size by zoom, the token's zooms the app's levels", () => {
    // The app's zoom 4 is MapLibre's 3 (glZoom).
    expect(labelText("airportIdent")).toEqual({
      "text-font": GL_FONT_BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 9, 12, 12, 13],
    });
    expect(labelText("checkpointName")).toEqual({ "text-font": GL_FONT, "text-size": 12 });
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
});
