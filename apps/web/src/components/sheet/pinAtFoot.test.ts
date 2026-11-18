import { describe, expect, it } from "vitest";
import { MAKES_WAY, barRoom, pinnedNow } from "./pinAtFoot";

describe("pinAtFoot", () => {
  it("holds the row at the pill whatever the slide", () => {
    expect(pinnedNow(true, 0, 400)).toBe(true);
  });

  it("holds the row off the pill only once the sheet slides past its room on the foot's edge", () => {
    // A tall portrait half: the figures' place is above the foot's edge.
    expect(pinnedNow(false, 120, 200)).toBe(false);
    // A short landscape half: their place is below it, so they wait on the
    // foot's edge (under the bar, which makes way as a pull begins).
    expect(pinnedNow(false, 300, 200)).toBe(true);
  });

  it("measures the bar's room from its top, not the foot's edge", () => {
    // The row 80 over the bar's top: the sheet slides 80 before the bar moves.
    expect(barRoom(600, 520)).toBe(80);
    // The row already under the bar at rest: no room, the swipe alone moves it.
    expect(barRoom(600, 650)).toBe(-50);
  });

  it("only ever moves the bar down, by no more than the finger's pull, on the drawer's curve", () => {
    expect(MAKES_WAY).toContain("max(0px,min(var(--sheet-swipe,0px),");
    expect(MAKES_WAY).toContain("var(--pin-bar-room,9999px)");
    expect(MAKES_WAY).toContain("group-data-swiping/sheet:transition-none");
  });
});
