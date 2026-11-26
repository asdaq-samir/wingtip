import { describe, expect, it } from "vitest";
import { CONTROLS, CONTROLS_TAPPABLE, CONTROLS_UNTAPPED } from "./sheetLayout";

describe("the sheet's controls", () => {
  it("are one list in the selector and both classes", () => {
    expect(CONTROLS_TAPPABLE).toBe(`[&_:is(${CONTROLS})]:pointer-events-auto`);
    expect(CONTROLS_UNTAPPED).toBe(`[&_:is(${CONTROLS})]:pointer-events-none`);
  });
});
