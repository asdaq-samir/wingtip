import { describe, expect, it } from "vitest";
import { cardOpening, openedFrom, type CardEntry } from "./sheetCards";

describe("cardOpening", () => {
  it("opens a card from the map, the search or anywhere else at half (the owner, 2026-11-11)", () => {
    expect(cardOpening({})).toBe("half");
  });

  it("opens a card at the size of the card it is opened from (the owner, 2026-11-26)", () => {
    expect(cardOpening({}, "full")).toBe("full");
    expect(cardOpening({}, "half")).toBe("half");
    // Over a card at its pill, at half, so it can be seen.
    expect(cardOpening({}, "peek")).toBe("half");
  });

  it("opens Emergency all the way up (the card rule's 4)", () => {
    expect(cardOpening({ fullScreen: true })).toBe("full");
    expect(cardOpening({ fullScreen: true }, "half")).toBe("full");
  });
});

describe("openedFrom", () => {
  const card = (id: string, change: Partial<CardEntry> = {}) =>
    ({ id, state: "open", frame: {}, slot: null, host: {} as HTMLElement, ...change }) as CardEntry;

  it("is the size of the top card open under it", () => {
    const stack = [card("airport", { at: "half" }), card("notam", { at: "full" }), card("new")];
    expect(openedFrom(stack, "new")).toBe("full");
  });

  it("passes over kept and leaving cards, and one not yet sized", () => {
    const stack = [card("airport", { at: "half" }), card("kept", { at: "full", state: "kept" }), card("other"), card("new")];
    expect(openedFrom(stack, "new")).toBe("half");
  });

  it("is none for the only card", () => {
    expect(openedFrom([card("new")], "new")).toBeUndefined();
  });
});
