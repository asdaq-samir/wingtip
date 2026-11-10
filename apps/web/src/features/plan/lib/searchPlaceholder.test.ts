import { describe, expect, it } from "vitest";
import { placeholderOf } from "./searchPlaceholder";

const pick = (label: string, fixes = false) => ({ label, fixes, onPick: () => {} });

describe("placeholderOf", () => {
  it("says what the one search is asked for", () => {
    expect(placeholderOf(true, null, "place")).toBe("Direct to which airport?");
    expect(placeholderOf(false, pick("Destination"), "place")).toBe("Search for a destination");
    expect(placeholderOf(false, pick("Airport"), "place")).toBe("Search for an airport");
    expect(placeholderOf(false, pick("Stop 1", true), "place")).toBe("Search airports and waypoints");
    expect(placeholderOf(false, null, "home")).toBe("Search for your home airport");
    expect(placeholderOf(false, null, "favorite")).toBe("Search for an airport to keep");
    expect(placeholderOf(false, null, "place")).toBe("Search airports, airplanes, or ask");
  });
});
