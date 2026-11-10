import { describe, expect, it } from "vitest";
import { placeholderOf } from "./searchPlaceholder";

const pick = (label: string, fixes = false) => ({ label, fixes, onPick: () => {} });

describe("placeholderOf", () => {
  it("says what the one search is asked for", () => {
    expect(placeholderOf(true, null, "place", true)).toBe("Direct to which airport?");
    expect(placeholderOf(false, pick("Destination"), "place", true)).toBe("Search for a destination");
    expect(placeholderOf(false, pick("Airport"), "place", true)).toBe("Search for an airport");
    expect(placeholderOf(false, pick("Stop 1", true), "place", true)).toBe("Search airports and waypoints");
    expect(placeholderOf(false, null, "home", true)).toBe("Search for your home airport");
    expect(placeholderOf(false, null, "favorite", true)).toBe("Search for an airport to keep");
    expect(placeholderOf(false, null, "place", true)).toBe("Search airports, airplanes, or ask");
    // No "or ask" while Claude is off: nothing would answer.
    expect(placeholderOf(false, null, "place", false)).toBe("Search airports and airplanes");
  });
});
