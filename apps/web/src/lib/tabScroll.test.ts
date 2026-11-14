import { describe, expect, it } from "vitest";
import { scrollOnPick } from "./tabScroll";

describe("scrollOnPick", () => {
  it("returns to the place kept on a tab seen", () => {
    expect(scrollOnPick(900, 300, 120)).toBe(120);
  });
  it("leaves the card where it is when the pages are still in sight", () => {
    expect(scrollOnPick(80, 300, null)).toBe(80);
    expect(scrollOnPick(300, 300, null)).toBe(300);
  });
  it("starts a new tab at the pages' top when the card was scrolled past it", () => {
    expect(scrollOnPick(900, 300, null)).toBe(300);
  });
});
