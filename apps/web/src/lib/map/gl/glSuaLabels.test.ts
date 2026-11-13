import { describe, expect, it } from "vitest";
import specialUseTab from "../../fixtures/specialUseTab.json";
import { AIRSPACE_LABELS_FROM, SUA_INK, glZoom } from "./glStyle";
import { SUA_TAB_PICTURES, specialUseLabelLayer, suaTab } from "./glSuaLabels";

/** As much of MapLibre's expressions as the tab's layout uses, evaluated
 *  for a feature's fields: the words the map would write. */
function evaluate(value: unknown, properties: Record<string, unknown>): unknown {
  if (!Array.isArray(value)) return value;
  const [op, ...args] = value as [string, ...unknown[]];
  const at = (i: number) => evaluate(args[i], properties);
  switch (op) {
    case "coalesce":
      return args.map((_, i) => at(i)).find((v) => v !== undefined && v !== null) ?? null;
    case "literal":
      return args[0];
    case "get":
      return properties[args[0] as string];
    case "concat":
      return args.map((_, i) => String(at(i))).join("");
    case "to-string":
      return String(at(0));
    case "round":
      return Math.round(at(0) as number);
    case "/":
      return (at(0) as number) / (at(1) as number);
    case "==":
      return at(0) === at(1);
    case "in":
      return (at(1) as unknown[]).includes(at(0));
    case "case":
      for (let i = 0; i + 1 < args.length; i += 2) if (at(i)) return at(i + 1);
      return at(args.length - 1);
    case "match": {
      const input = at(0);
      for (let i = 1; i + 1 < args.length; i += 2) if (args[i] === input) return at(i + 1);
      return at(args.length - 1);
    }
    default:
      throw new Error(`no ${op} here`);
  }
}

const text = (properties: Record<string, unknown>) => {
  const value = evaluate(specialUseLabelLayer(["Inter Bold"]).layout!["text-field"], properties);
  return typeof value === "string" ? value : String(value);
};

describe("a special-use area's tab", () => {
  it("draws the engine's words the charts job wrote into the tiles", () => {
    // The engine's special_use_tab for the owner's screenshot's areas
    // (lib/fixtures/specialUseTab.json), as the tiles carry it.
    for (const { answer } of specialUseTab.cases)
      if (answer) expect(text({ tab: answer.text, label: answer.name, type: "MOA" })).toBe(answer.text);
    // An archive written before the tiles carried the words: the name.
    expect(text({ label: "M-BRADY NOR*", floor_ft: 3600, floor_ref: "MSL" })).toBe("M-BRADY NOR*");
  });

  it("is turned along its side and set inside the area, from the class labels' zoom", () => {
    const layer = specialUseLabelLayer(["Inter Bold"]);
    expect(layer["source-layer"]).toBe("special_use_labels");
    expect(layer.minzoom).toBe(glZoom(AIRSPACE_LABELS_FROM));
    expect(layer.layout).toMatchObject({ "text-rotate": ["get", "angle"], "text-rotation-alignment": "map", "icon-text-fit": "both" });
    const below = evaluate(layer.layout!["text-offset"], { side: 1 }) as number[];
    const above = evaluate(layer.layout!["text-offset"], { side: -1 }) as number[];
    expect(below[1]).toBeGreaterThan(0);
    expect(above[1]).toBeLessThan(0);
  });

  it("is bordered in the area's ink: a restricted area's or a MOA's", () => {
    const layer = specialUseLabelLayer(["Inter Bold"]);
    expect(evaluate(layer.layout!["icon-image"], { type: "R" })?.toString()).toBe(suaTab("restricted"));
    expect(evaluate(layer.layout!["icon-image"], { type: "MOA" })?.toString()).toBe(suaTab("moa"));
    for (const [id, svg] of SUA_TAB_PICTURES) {
      const ink = id === suaTab("restricted") ? SUA_INK.restricted : SUA_INK.moa;
      expect(svg()).toContain(`stroke="${ink}"`);
    }
  });

  it("writes the name alone along the boundary where an older archive has no tabs", () => {
    const older = specialUseLabelLayer(["Inter Bold"], false);
    expect(older["source-layer"]).toBe("special_use");
    expect(older.layout).toMatchObject({ "symbol-placement": "line", "text-field": ["get", "name"] });
  });
});
