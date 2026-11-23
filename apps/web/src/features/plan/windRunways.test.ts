import { describe, expect, it } from "vitest";
import { askedRunways, firstWindPicks, windPickedEnds } from "./windRunways";

describe("the runways the nav log is asked with", () => {
  it("reads each runway picked into the wind from the address", () => {
    expect(windPickedEnds("land:KDLH,takeoff:KMSN", "KDLH:27,C81:24", "KMSN:36")).toEqual({ "land:KDLH": "27", "takeoff:KMSN": "36" });
    // An address from before `auto`: every runway in it the wind's.
    expect(windPickedEnds(null, "KDLH:27", null)).toEqual({ "land:KDLH": "27" });
    expect(windPickedEnds("-", "KDLH:27", null)).toEqual({});
  });

  it("keeps the wind's first picks for a route, adding a field picked later, and starts again on a new route", () => {
    const none = { route: "", ends: {} };
    const first = firstWindPicks(none, "C81,KDLH", { "land:KDLH": "27" });
    expect(first).toEqual({ route: "C81,KDLH", ends: { "land:KDLH": "27" } });
    // Nothing new: the same object, so a render setting it settles.
    expect(firstWindPicks(first, "C81,KDLH", { "land:KDLH": "27" })).toBe(first);
    // The wind turns KDLH to 9: the first pick stays the first.
    expect(firstWindPicks(first, "C81,KDLH", { "land:KDLH": "9" })).toBe(first);
    const both = firstWindPicks(first, "C81,KDLH", { "land:KDLH": "27", "land:C81": "24" });
    expect(both.ends).toEqual({ "land:KDLH": "27", "land:C81": "24" });
    expect(firstWindPicks(both, "C81,KMSN,KDLH", { "land:KDLH": "9" })).toEqual({ route: "C81,KMSN,KDLH", ends: { "land:KDLH": "9" } });
  });

  it("leaves out the wind's picks still as first picked, which the planner picks itself, and names the rest", () => {
    const ends = { "land:KDLH": "27", "takeoff:KMSN": "36" };
    // As first picked: the planner's own, left out.
    expect(askedRunways("KMSN:36,KDLH:27", () => "land", ends, ends)).toBe("KMSN:36");
    expect(askedRunways("KMSN:36", (i) => (i === "KMSN" ? "takeoff" : "land"), ends, ends)).toBe("");
    // The wind turned KDLH from 9: asked for by name.
    expect(askedRunways("KDLH:27", () => "land", ends, { "land:KDLH": "9" })).toBe("KDLH:27");
    // The pilot's own pick (not the wind's): always asked for.
    expect(askedRunways("C81:24", () => "land", ends, ends)).toBe("C81:24");
    expect(askedRunways("", () => "land", ends, ends)).toBe("");
  });
});
