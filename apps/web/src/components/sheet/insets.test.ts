import { describe, expect, it } from "vitest";
import { CARD, CARD_WIDE, FLOAT_PX, insetsOf, sizeAt, snapsOf } from "./insets";

describe("insetsOf", () => {
  it("leaves a phone's map the strip the sheet in sight covers", () => {
    expect(insetsOf("peek", 62, true, true, 59)).toEqual({ top: 59, bottom: 62, left: 0, out: false, up: false });
    expect(insetsOf("full", 376, true, true, 59)).toEqual({ top: 59, bottom: 376, left: 0, out: true, up: true });
    // A sheet from the top covers the status bar itself.
    expect(insetsOf("half", 376, true, false, 59)).toEqual({ top: 376, bottom: 0, left: 0, out: true, up: false });
  });

  it("leaves a wider screen's map all but the side panel's column while it is out", () => {
    expect(insetsOf("half", 0, false, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD, out: true, up: false });
    // A desktop's side panel is wider, and so is what it covers.
    expect(insetsOf("full", 0, false, true, 0, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD_WIDE, out: true, up: true });
    // At rest, its head in the top corner whichever edge the phone's sheet is on.
    expect(insetsOf("peek", 62, false, true)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
    expect(insetsOf("peek", 62, false, false)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
  });
});

describe("the snap points", () => {
  it("are the same values every time, in the Drawer's own units", () => {
    expect(snapsOf(true).points).toBe(snapsOf(true).points);
    expect(snapsOf(true).points).toEqual(["4.75rem", "23rem", 1]);
    expect(snapsOf(false).points).toEqual(["5.25rem", "23rem", 1]);
  });

  it("map the Drawer's point back to a size by identity", () => {
    expect(sizeAt(true, "4.75rem")).toBe("peek");
    expect(sizeAt(true, "23rem")).toBe("half");
    expect(sizeAt(false, 1)).toBe("full");
    expect(sizeAt(true, 0.5)).toBeUndefined();
  });
});
