import { describe, expect, it } from "vitest";
import { insertedRoute, movedRoute, replacedRoute } from "./useRouteListEdit";

// Airports by their four letters, a waypoint by its five.
const isEnd = (p: string) => p.length === 4 || p.startsWith("@");

describe("a point dragged in FPL's list", () => {
  it("is moved, the route's ends and stops from the new order", () => {
    expect(movedRoute(["KUGN", "KJVL", "KMSN", "KDLH"], 2, 1, isEnd)).toEqual({ dep: "KUGN", stops: ["KMSN", "KJVL"], dest: "KDLH" });
  });

  it("is not moved to an end where it is a waypoint", () => {
    expect(movedRoute(["KUGN", "VPBNG", "KDLH"], 1, 0, isEnd)).toBeNull();
  });

  it("is not moved beside the same point", () => {
    expect(movedRoute(["KUGN", "KMSN", "KDLH", "KMSN"], 3, 2, isEnd)).toBeNull();
  });
});

describe("a point made another from its card", () => {
  it("takes what is typed, in capitals", () => {
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, " kmsn ")).toEqual({ dep: "KUGN", stops: ["KMSN"], dest: "KDLH" });
  });

  it("lets go of an empty one, one the same as its neighbour, or one out of the route", () => {
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, " ")).toBeNull();
    expect(replacedRoute(["KUGN", "KJVL", "KDLH"], 1, "KUGN")).toBeNull();
    expect(replacedRoute(["KUGN", "KDLH"], 2, "KMSN")).toBeNull();
  });
});

describe("a stop typed in at its place", () => {
  it("is put in there", () => {
    expect(insertedRoute(["KUGN", "KDLH"], 1, "kjvl")).toEqual({ dep: "KUGN", stops: ["KJVL"], dest: "KDLH" });
  });

  it("is let go beside the same point", () => {
    expect(insertedRoute(["KUGN", "KDLH"], 1, "KDLH")).toBeNull();
  });
});
