import { describe, expect, it } from "vitest";
import { placeholderOf, searchWords } from "./searchPlaceholder";

const pick = (label: string, fixes = false) => ({ label, fixes, onPick: () => {} });

describe("placeholderOf", () => {
  it("says what the one search is asked for", () => {
    expect(placeholderOf(true, null, "place")).toBe("Direct to which airport?");
    expect(placeholderOf(false, pick("Destination"), "place")).toBe("Search for a destination");
    expect(placeholderOf(false, pick("Airport"), "place")).toBe("Search for an airport");
    expect(placeholderOf(false, pick("Stop 1", true), "place")).toBe("Search airports and waypoints");
    expect(placeholderOf(false, null, "home")).toBe("Search for your home airport");
    expect(placeholderOf(false, null, "favorite")).toBe("Search for an airport to keep");
    expect(placeholderOf(false, null, "mine")).toBe("Search for your airplane");
    expect(placeholderOf(false, null, "airplane")).toBe("Search for an airplane to keep");
    expect(placeholderOf(false, null, "place")).toBe("Search");
  });

  it("names the airport asked for in place of a point, the point's name as written (route-fields)", () => {
    expect(placeholderOf(false, pick("In place of My Location"), "place")).toBe("Search for an airport in place of My Location");
    expect(placeholderOf(false, pick("In place of KDLH"), "place")).toBe("Search for an airport in place of KDLH");
  });
});

describe("searchWords", () => {
  it("shows the default as Search, its name saying what it finds (the owner, 2026-11-20)", () => {
    expect(searchWords(false, null, "place")).toEqual({ label: "Search airports and airplanes", placeholder: "Search" });
  });

  it("keeps the one word in the field when it asks for something, the ask its name (the owner, 2026-11-21)", () => {
    expect(searchWords(false, pick("Destination"), "place")).toEqual({ label: "Search for a destination", placeholder: "Search" });
    expect(searchWords(true, null, "place")).toEqual({ label: "Direct to which airport?", placeholder: "Search" });
  });
});
