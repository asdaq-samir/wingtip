import { describe, expect, it } from "vitest";
import { FULL_SWIPE, swipeEnd } from "./swipeEnd";

// A 402-point row, an iPhone's width, with an 88-point Remove.
const WIDTH = 402;
const REVEAL = 88;

describe("swipeEnd", () => {
  it("closes again on a short, slow swipe", () => {
    expect(swipeEnd(-20, 0, WIDTH, REVEAL)).toBe("closed");
  });

  it("opens on its button past half the button", () => {
    expect(swipeEnd(-50, 0, WIDTH, REVEAL)).toBe("open");
    expect(swipeEnd(-200, 0, WIDTH, REVEAL)).toBe("open");
  });

  it("opens on a flick to the left however short", () => {
    expect(swipeEnd(-10, -800, WIDTH, REVEAL)).toBe("open");
  });

  it("closes on a flick to the right short of the full-swipe line", () => {
    expect(swipeEnd(-200, 800, WIDTH, REVEAL)).toBe("closed");
  });

  it("removes past the full-swipe line, whatever the speed", () => {
    expect(swipeEnd(-(WIDTH * FULL_SWIPE + 1), 0, WIDTH, REVEAL)).toBe("remove");
    expect(swipeEnd(-(WIDTH * FULL_SWIPE + 1), 800, WIDTH, REVEAL)).toBe("remove");
  });

  it("never removes a row not yet measured", () => {
    expect(swipeEnd(-500, 0, 0, REVEAL)).toBe("open");
  });
});
