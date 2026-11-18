import { describe, expect, it } from "vitest";
import { MAKES_WAY, barRoom, grewUnderBar, pinnedNow } from "./pinAtFoot";

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

describe("grewUnderBar", () => {
  // The unfolded-stops repro (402x874 at half, the sheet slid 498 down):
  // a stop added took the figures' foot from 314 to 359 below all the way
  // up's top, 407 above the bar's top, so 91 under the bar at rest.
  it("is a row pushed down under the bar's top at rest", () => {
    expect(grewUnderBar(314, 359, 407, 498)).toBe(true);
  });
  it("is not a row measured again in place, nor the first measure", () => {
    expect(grewUnderBar(359, 359, 407, 498)).toBe(false);
    expect(grewUnderBar(null, 359, 407, 498)).toBe(false);
  });
  it("is not a row pushed down that still clears the bar, nor one that moved up", () => {
    expect(grewUnderBar(269, 314, 500, 498)).toBe(false);
    expect(grewUnderBar(400, 359, 407, 498)).toBe(false);
  });
});
