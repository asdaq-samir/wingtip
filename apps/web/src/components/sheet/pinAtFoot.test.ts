import { describe, expect, it } from "vitest";
import { PIN_AT_FOOT, RIDES_ON_PIN, barLift, pinnedNow } from "./pinAtFoot";

describe("pinAtFoot", () => {
  it("holds the row at the pill whatever the slide", () => {
    expect(pinnedNow(true, 0, 400)).toBe(true);
  });

  it("holds the row off the pill only once the sheet slides past its room on the foot's edge", () => {
    // The side panel's, or a place above the foot's edge.
    expect(pinnedNow(false, 120, 200)).toBe(false);
    // Its place below the edge, so it waits on the foot's edge.
    expect(pinnedNow(false, 300, 200)).toBe(true);
  });

  it("lets the row's move go down as well as up where --pin-cap says so (a phone's bottom sheet)", () => {
    expect(PIN_AT_FOOT).toContain("translateY(min(var(--pin-cap,0px),calc(var(--pin-room,9999px)");
  });

  it("lifts the bar so its foot is 4 points over the figures held on the foot's edge, and no more", () => {
    // The owner's iPhone at 19.65 px: the bar's foot at 848, the figures
    // 785-844 on the foot's edge: lifted 67, its foot at 781.
    expect(barLift(848, 785)).toBe(67);
    // A bar already clear of them is left where it is.
    expect(barLift(700, 785)).toBe(0);
  });

  it("only ever moves the bar up, by its lift, with no ease of its own", () => {
    expect(RIDES_ON_PIN).toBe("[transform:translateY(calc(-1*var(--pin-bar-lift,0px)))]");
  });
});
