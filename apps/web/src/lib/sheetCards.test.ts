import { describe, expect, it } from "vitest";
import { cardOpening, coverCard, floatLayer, ridingOver, topCard, type CardEntry } from "./sheetCards";

describe("cardOpening", () => {
  it("opens every card at half (the owner, 2026-11-11)", () => {
    expect(cardOpening({})).toBe("half");
  });

  it("opens Emergency all the way up (the card rule's 4)", () => {
    expect(cardOpening({ fullScreen: true })).toBe("full");
  });
});

describe("floating cards among the riding ones", () => {
  const entry = (id: string, float: boolean, at?: "half" | "full"): CardEntry => ({ id, float, at, state: "open", frame: {}, slot: null });

  it("covers none of the sheet: the map's buttons and room follow the riding cards alone", () => {
    expect(coverCard([entry("map", true)])).toBeNull();
    expect(coverCard([entry("airport", false, "half"), entry("notam", true)])?.id).toBe("airport");
  });

  it("is the top card when last opened, Escape and a tap outside its own", () => {
    expect(topCard([entry("airport", false, "half"), entry("notam", true)])).toBe("notam");
    expect(topCard([entry("nearest", true), { ...entry("map", true), state: "kept" }])).toBe("nearest");
  });

  it("floats over the floating cards opened before it", () => {
    const stack = [entry("map", true), entry("airport", false, "half"), entry("you", true)];
    expect(floatLayer(stack, "map")).toBe(0);
    expect(floatLayer(stack, "you")).toBe(1);
  });

  it("is put away while an airport's card opened from it rides the sheet", () => {
    expect(ridingOver([entry("nearest", true), entry("airport", false, "half")], "nearest")).toBe(true);
    expect(ridingOver([entry("airport", false, "half"), entry("notam", true)], "notam")).toBe(false);
  });
});
