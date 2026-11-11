import { describe, expect, it } from "vitest";
import { CARD, CARD_WIDE, FLOAT_PX, insetsOf, type Detents } from "./insets";

const detents: Detents = { peek: 62, half: 376, full: 820 };

describe("insetsOf", () => {
  it("leaves a phone's map the pill's strip at rest, and half all the way up", () => {
    expect(insetsOf("peek", detents, true, true, 59)).toEqual({ top: 59, bottom: 62, left: 0, out: false, up: false });
    expect(insetsOf("full", detents, true, true, 59)).toEqual({ top: 59, bottom: 376, left: 0, out: true, up: true });
    // A sheet from the top covers the status bar itself.
    expect(insetsOf("half", detents, true, false, 59)).toEqual({ top: 376, bottom: 0, left: 0, out: true, up: false });
  });

  it("leaves a wider screen's map all but the side panel's column while it is out", () => {
    expect(insetsOf("half", detents, false, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD, out: true, up: false });
    // A desktop's side panel is wider, and so is what it covers.
    expect(insetsOf("full", detents, false, true, 0, true)).toEqual({ top: 0, bottom: 0, left: FLOAT_PX + CARD_WIDE, out: true, up: true });
    // At rest, its head in the top corner whichever edge the phone's sheet is on.
    expect(insetsOf("peek", detents, false, true)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
    expect(insetsOf("peek", detents, false, false)).toEqual({ top: 62 + 8 + FLOAT_PX, bottom: 0, left: 0, out: false, up: false });
  });
});
