import { describe, expect, it } from "vitest";
import { fileOf, levelName, levelShown, levelsOf } from "./flowLevels";
import type { FlowLayer } from "./useWeatherFlow";

const layer = { levels: { wind: ["sfc", "030", "060", "max"], icing: ["030", "060"], turbulence: ["060", "max"] } } as unknown as FlowLayer;

describe("the flow layer's levels, by AWC's names", () => {
  it("gives the wind its levels, the temperature the same but Max, and the others none", () => {
    expect(levelsOf(layer, "wind")).toEqual(["sfc", "030", "060", "max"]);
    expect(levelsOf(layer, "temp")).toEqual(["sfc", "030", "060"]);
    expect(levelsOf(layer, "precip")).toEqual([]);
  });

  it("keeps the pilot's level where the field has it, else the field's first", () => {
    expect(levelShown(layer, "wind", "060")).toBe("060");
    expect(levelShown(layer, "icing", "sfc")).toBe("030");
    expect(levelShown(layer, "precip", "060")).toBeNull();
  });

  it("names the surface's picture by the field and a level's after a dash", () => {
    expect(fileOf("wind", "sfc")).toBe("wind");
    expect(fileOf("wind", "060")).toBe("wind-060");
    expect(fileOf("turb", "max")).toBe("turb-max");
    expect(fileOf("precip", null)).toBe("precip");
  });

  it("says a level as the map writes a level, the surface and Max in words", () => {
    expect(levelName("sfc")).toBe("Surface");
    expect(levelName("max")).toBe("Max");
    expect(levelName("060")).toBe("FL060");
  });
});
