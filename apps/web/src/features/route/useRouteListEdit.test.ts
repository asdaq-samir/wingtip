import { describe, expect, it } from "vitest";
import { addedRoute, endedRoute, movedRoute, replacedRoute } from "./useRouteListEdit";

// Airports by their four letters, a waypoint by its five.
const isEnd = (p: string) => p.length === 4 || p.startsWith("@");

describe("a point dragged in FPL's list", () => {
  it("is moved, the route's ends and stops from the new order", () => {
    expect(movedRoute(["KUGN", "KJVL", "KMSN", "KDLH"], 2, 1, isEnd)).toEqual({ dep: "KUGN", stops: ["KMSN", "KJVL"], dest: "KDLH" });
  });

  it("is not moved to an end where it is a waypoint", () => {
    expect(movedRoute(["KUGN", "VPBNG", "KDLH"], 1, 0, isEnd)).toBeNull();
  });

  it("keeps My Location at an end: to the other end, never a stop", () => {
    expect(movedRoute(["@42.2,-87.9", "KMSN", "KDLH"], 0, 2, isEnd)).toEqual({ dep: "KMSN", stops: ["KDLH"], dest: "@42.2,-87.9" });
    expect(movedRoute(["@42.2,-87.9", "KMSN", "KDLH"], 0, 1, isEnd)).toBeNull();
    expect(movedRoute(["KUGN", "KMSN", "@42.2,-87.9"], 2, 1, isEnd)).toBeNull();
  });

  it("is not moved beside the same point", () => {
    expect(movedRoute(["KUGN", "KMSN", "KDLH", "KMSN"], 3, 2, isEnd)).toBeNull();
  });
});

describe("a point made another from its menu's Change", () => {
  it("takes what is typed, in capitals", () => {
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, " kmsn ")).toEqual({ dep: "KUGN", stops: ["KMSN"], dest: "KDLH" });
  });

  it("lets go of an empty one, one the same as its neighbour, or one out of the route", () => {
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, " ")).toBeNull();
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, "KUGN")).toBeNull();
    expect(replacedRoute(["KUGN", "KDLH"], 2, "KMSN")).toBeNull();
  });

  it("never makes a stop My Location, which goes at an end alone", () => {
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, "@42.2,-87.9")).toBeNull();
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 0, "@42.2,-87.9")).toEqual({ dep: "@42.2,-87.9", stops: ["KJVL"], dest: "KDLH" });
  });
});

describe("a stop added from FPL's timeline", () => {
  it("goes in at its place, before the destination from Add a Stop", () => {
    expect(addedRoute(["KUGN", "KMSN", "KDLH"], 2, "kjvl")).toEqual({ dep: "KUGN", stops: ["KMSN", "KJVL"], dest: "KDLH" });
  });

  it("is not put beside the same point, nor before the departure", () => {
    expect(addedRoute(["KUGN", "KMSN", "KDLH"], 2, "KMSN")).toBeNull();
    expect(addedRoute(["KUGN", "KDLH"], 0, "KMSN")).toBeNull();
  });

  it("is never My Location", () => {
    expect(addedRoute(["KUGN", "KMSN", "KDLH"], 2, "@42.2,-87.9")).toBeNull();
  });
});

describe("an end the route lacks, picked from its row on FPL's timeline", () => {
  it("is put in its place, in capitals, the rest kept", () => {
    expect(endedRoute({ dep: "", stops: [], dest: "" }, "Departure", " kmsn ")).toEqual({ dep: "KMSN", stops: [], dest: "" });
    expect(endedRoute({ dep: "KMSN", stops: ["KJVL"], dest: "" }, "Destination", "kdlh")).toEqual({
      dep: "KMSN",
      stops: ["KJVL"],
      dest: "KDLH",
    });
  });

  it("takes My Location as it is", () => {
    expect(endedRoute({ dep: "", stops: [], dest: "KDLH" }, "Departure", "@42.2,-87.9")).toEqual({
      dep: "@42.2,-87.9",
      stops: [],
      dest: "KDLH",
    });
  });
});
