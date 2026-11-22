import { describe, expect, it } from "vitest";
import { MAKES_WAY, PIN_STICKS, barRoom, liftAt, pinnedNow } from "./pinAtFoot";

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

  it("holds the row on the foot's top, over the bar, off the pill, and lets it down onto the foot's edge at the pill", () => {
    // All the way up and at half: the foot's whole height (88) under it.
    expect(liftAt(0, 88, 760)).toBe(88);
    expect(liftAt(392, 88, 760)).toBe(88);
    // The last 88 of a slide to the pill, less and less; none at the pill.
    expect(liftAt(720, 88, 760)).toBe(40);
    expect(liftAt(760, 88, 760)).toBe(0);
    // A row whose place is 17 over the foot's edge, all the way up: held,
    // since the foot's top is 88 over that edge.
    expect(pinnedNow(false, 0, 17, liftAt(0, 88, 760))).toBe(true);
    expect(pinnedNow(false, 0, 120, liftAt(0, 88, 760))).toBe(false);
  });

  it("holds the row's box at the page's foot by the browser's own sticky, on a phone's bottom sheet alone", () => {
    expect(PIN_STICKS.split(" ")).toEqual([
      "in-data-[swipe-direction=down]:sticky",
      "in-data-[swipe-direction=down]:bottom-0",
      "in-data-[swipe-direction=down]:z-30",
    ]);
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
