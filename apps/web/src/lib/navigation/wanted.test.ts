import { afterEach, describe, expect, it, vi } from "vitest";
import { screenLink, screenOf, SCREENS } from "./generated/screens";
import { takePlace, takeScreen, useWanted, wantPlace, wantScreen } from "./wanted";

afterEach(() => {
  vi.useRealTimers();
  useWanted.setState({ screen: null, place: null, at: 0 });
});

describe("screens a link opens", () => {
  it("reads only the names design/screens.json gives the web", () => {
    expect(screenOf("logbook")).toBe("logbook");
    expect(screenOf("nowhere")).toBeNull();
    expect(screenOf("toString")).toBeNull();
    expect(screenOf(null)).toBeNull();
    // A phone's own screen is not the web's.
    expect(screenOf("downloads")).toBeNull();
  });

  it("writes the address every platform opens", () => {
    expect(screenLink("navlog", "https://wingtipmaps.app")).toBe("https://wingtipmaps.app/app/plan?open=navlog");
    expect(SCREENS.emergency.title).toBe("Emergency Assistant");
  });
});

describe("a screen asked for", () => {
  it("is taken once", () => {
    wantScreen("brief");
    expect(takeScreen()).toBe("brief");
    expect(takeScreen()).toBeNull();
  });

  it("is let go after waiting too long for its route", () => {
    vi.useFakeTimers();
    wantScreen("brief");
    vi.advanceTimersByTime(31_000);
    expect(takeScreen()).toBeNull();
  });

  it("keeps a field's card apart from a screen", () => {
    wantPlace("KDLH");
    expect(takeScreen()).toBeNull();
    expect(takePlace()).toBe("KDLH");
    expect(takePlace()).toBeNull();
  });
});
