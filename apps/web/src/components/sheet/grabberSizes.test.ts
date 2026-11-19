import { describe, expect, it } from "vitest";
import { SHEET_SIZES, SIDE_SIZES, tapTo } from "./grabberSizes";

describe("the grabber's tap (tapTo)", () => {
  it("cycles a phone's sheet small to big and back", () => {
    expect(tapTo("peek", true, SHEET_SIZES)).toBe("half");
    expect(tapTo("half", true, SHEET_SIZES)).toBe("full");
    expect(tapTo("full", false, SHEET_SIZES)).toBe("half");
    expect(tapTo("half", false, SHEET_SIZES)).toBe("peek");
  });

  it("puts the side panel in and out, never asking for all the way up, the same box as half there", () => {
    // The owner's Mac, 2026-11-18: a tap at half asked for all the way up,
    // the address said so and the panel did not move.
    expect(tapTo("half", true, SIDE_SIZES)).toBe("peek");
    expect(tapTo("peek", false, SIDE_SIZES)).toBe("half");
    // All the way up from the address (?view=full) looks like out: a tap puts it in.
    expect(tapTo("full", false, SIDE_SIZES)).toBe("peek");
  });
});
