import { describe, expect, it } from "vitest";
import { cardOpening } from "./sheetCards";

describe("cardOpening", () => {
  it("opens every card at half (the owner, 2026-11-11)", () => {
    expect(cardOpening({})).toBe("half");
  });

  it("opens Emergency all the way up (the card rule's 4)", () => {
    expect(cardOpening({ fullScreen: true })).toBe("full");
  });
});
