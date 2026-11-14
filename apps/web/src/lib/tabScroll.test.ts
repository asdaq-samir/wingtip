import { describe, expect, it } from "vitest";
import { scrollOnPick } from "./tabScroll";

describe("scrollOnPick", () => {
  it("opens a tab at its page's top when the card was scrolled into the last tab's page", () => {
    expect(scrollOnPick(900, 300)).toBe(300);
  });
  it("leaves the card where it is while the actions are in sight", () => {
    expect(scrollOnPick(80, 300)).toBe(80);
    expect(scrollOnPick(0, 300)).toBe(0);
    expect(scrollOnPick(300, 300)).toBe(300);
  });
  it("does not keep a tab's old place: back on a tab it opens at its top too", () => {
    // Info scrolled to 700, Weather picked (300), then Info again: its top, not 700.
    expect(scrollOnPick(scrollOnPick(700, 300), 300)).toBe(300);
  });
});
