import { describe, expect, it } from "vitest";
import {
  placeAllowed,
  pointsOf,
  readTyped,
  releaseTyped,
  routeOf,
  withoutPoint,
  withoutStop,
  withTyped,
  type RouteShape,
} from "./routeEdit";

// Airports are four letters here, waypoints five (a fix's ident).
const isEnd = (ident: string) => ident.length === 4 || ident.length === 3;
const shape = (points: string[], hasDep = true, hasDest = true): RouteShape => ({ points, hasDep, hasDest, isEnd });

describe("the route box's rules for a list of points", () => {
  it("keeps the ends where they were", () => {
    expect(routeOf(["KDLH", "KMSP", "KMDW"], true, true, isEnd)).toEqual({ dep: "KDLH", stops: ["KMSP"], dest: "KMDW" });
    expect(routeOf(["KMSP", "KMDW"], false, true, isEnd)).toEqual({ dep: "", stops: ["KMSP"], dest: "KMDW" });
  });

  it("never ends at a waypoint, nor has a point straight after itself", () => {
    expect(routeOf(["KDLH", "VPBNG"], true, true, isEnd)).toBeNull();
    expect(routeOf(["KDLH", "KMSP", "KMSP", "KMDW"], true, true, isEnd)).toBeNull();
    // One airport twice is let through, to be said and changed.
    expect(routeOf(["KDLH", "KDLH"], true, true, isEnd)).toEqual({ dep: "KDLH", stops: [], dest: "KDLH" });
  });

  it("takes no more stops than the planner does", () => {
    const stops = Array.from({ length: 17 }, (_, i) => `K${String(i).padStart(3, "0")}`);
    expect(routeOf(["KDLH", ...stops, "KMDW"], true, true, isEnd)).toBeNull();
  });

  it("reads the points of a route in the order flown", () => {
    expect(pointsOf({ dep: "", stops: ["KMSP"], dest: "KMDW" })).toEqual(["KMSP", "KMDW"]);
  });
});

describe("a point taken out of the box", () => {
  it("makes the next airport along the end taken out", () => {
    expect(withoutPoint(shape(["KDLH", "KMSP", "KMDW"]), 0)).toEqual({ dep: "KMSP", stops: [], dest: "KMDW" });
    expect(withoutPoint(shape(["KDLH", "KMSP", "KMDW"]), 2)).toEqual({ dep: "KDLH", stops: [], dest: "KMSP" });
  });

  it("leaves half a route of two, and none of one", () => {
    expect(withoutPoint(shape(["KDLH", "KMDW"]), 1)).toEqual({ dep: "KDLH", stops: [], dest: "" });
    expect(withoutPoint(shape(["KDLH", "KMDW"]), 0)).toEqual({ dep: "", stops: [], dest: "KMDW" });
    expect(withoutPoint(shape(["KDLH"], true, false), 0)).toEqual({ dep: "", stops: [], dest: "" });
  });

  it("leaves no end at a waypoint: the waypoint after a departure taken out is a stop", () => {
    expect(withoutPoint(shape(["KDLH", "VPBNG", "KMDW"]), 0)).toEqual({ dep: "", stops: ["VPBNG"], dest: "KMDW" });
  });
});

describe("words typed, put in where they were typed", () => {
  it("before a point, as stops", () => {
    expect(withTyped(shape(["KDLH", "KMDW"]), ["KMSP"], 1)).toEqual({ route: { dep: "KDLH", stops: ["KMSP"], dest: "KMDW" }, next: 2 });
  });

  it("after the last, the new destination, the old one a stop on the way", () => {
    expect(withTyped(shape(["KDLH", "KMDW"]), ["KMSN"], null)).toEqual({
      route: { dep: "KDLH", stops: ["KMDW"], dest: "KMSN" },
      next: null,
    });
  });

  it("a waypoint typed after the last goes before the destination: a flight does not end at one", () => {
    expect(withTyped(shape(["KDLH", "KMDW"]), ["VPBNG"], null).route).toEqual({ dep: "KDLH", stops: ["VPBNG"], dest: "KMDW" });
  });

  it("before the first with no departure, the departure where it is an airport", () => {
    expect(withTyped(shape(["KMDW"], false, true), ["KDLH"], 0).route).toEqual({ dep: "KDLH", stops: [], dest: "KMDW" });
    expect(withTyped(shape(["KMDW"], false, true), ["VPBNG"], 0).route).toEqual({ dep: "", stops: ["VPBNG"], dest: "KMDW" });
  });

  it("into an empty box, the first airport the departure and the last the destination", () => {
    expect(withTyped(shape([], false, false), ["KDLH"], null).route).toEqual({ dep: "KDLH", stops: [], dest: "" });
    expect(withTyped(shape([], false, false), ["KDLH", "KMSP", "KMDW"], null).route).toEqual({
      dep: "KDLH",
      stops: ["KMSP"],
      dest: "KMDW",
    });
  });

  it("after half a route, the destination", () => {
    expect(withTyped(shape(["KDLH"], true, false), ["KMDW"], null).route).toEqual({ dep: "KDLH", stops: [], dest: "KMDW" });
  });
});

describe("words typed, read", () => {
  it("takes the SIDs and STARs out as the route's procedures, with the points either side", () => {
    expect(readTyped(["c81", "BAEE1", "BAE", "OSH", "OSHH2", "katw"], true)).toMatchObject({
      fresh: ["C81", "BAE", "OSH", "KATW"],
      procedures: [
        { name: "BAEE1", before: "C81", after: "BAE" },
        { name: "OSHH2", before: "OSH", after: "KATW" },
      ],
    });
  });

  it("leaves them as points where the box has nowhere to send them", () => {
    expect(readTyped(["KMSP", "BAEE1"], false).procedures).toEqual([]);
  });

  it("drops what is empty", () => {
    expect(readTyped(["", " ", "kmsp"], true).fresh).toEqual(["KMSP"]);
  });

  it("reads a filed route pasted whole by the engine: DCT out, the group the cruise", () => {
    const read = readTyped("N0110A065 KPWK DCT OBK V100 LEXOR/N0110A075 KLAS".split(" "), true);
    expect(read.fresh).toEqual(["KPWK", "OBK", "V100", "LEXOR", "KLAS"]);
    expect(read.cruiseFt).toBe(6_500);
    expect(readTyped(["KPWK", "KLAS"], true).cruiseFt).toBeNull();
    // A position keeps its comma.
    expect(readTyped(["@42.1,-88.2", "dct", "KMSN"], true).words).toEqual(["@42.1,-88.2", "KMSN"]);
  });
});

describe("a SID or STAR typed last, held till what follows it", () => {
  it("waits for the destination typed after a STAR, then is given out with it", () => {
    const held = { current: [] };
    const first = readTyped(["C81", "BAEE1", "BAE", "OSH", "OSHH2"], true);
    expect(releaseTyped(held, ["C81", "BAEE1", "BAE", "OSH", "OSHH2"], first.procedures, false).map((p) => p.name)).toEqual(["BAEE1"]);
    expect(held.current).toEqual([{ name: "OSHH2", before: "OSH", after: null }]);
    expect(releaseTyped(held, ["KATW"], [], true)).toEqual([{ name: "OSHH2", before: "OSH", after: "KATW" }]);
    expect(held.current).toEqual([]);
  });

  it("gives out one typed last as the typing is done", () => {
    const held = { current: [] };
    expect(releaseTyped(held, ["OSHH2"], readTyped(["OSHH2"], true).procedures, true).map((p) => p.name)).toEqual(["OSHH2"]);
  });
});

describe("where a point may go", () => {
  const route = (dep: string, stops: string[], dest: string) => ({ dep, stops, dest });

  it("keeps My Location at an end, never a stop on the way", () => {
    expect(placeAllowed(route("@42.2,-87.9", ["KMSN"], "KDLH"))).toBe(true);
    expect(placeAllowed(route("KUGN", ["@42.2,-87.9"], "KDLH"))).toBe(false);
  });

  it("puts no point straight after itself, but for a local flight where asked", () => {
    expect(placeAllowed(route("KUGN", ["KMSN", "KMSN"], "KDLH"))).toBe(false);
    expect(placeAllowed(route("KDLH", [], "KDLH"))).toBe(false);
    expect(placeAllowed(route("KDLH", [], "KDLH"), true)).toBe(true);
  });

  it("is the box's rule too: a list with My Location as a stop is not taken", () => {
    expect(routeOf(["KUGN", "@42.2,-87.9", "KDLH"], true, true, (p) => p.length === 4 || p.startsWith("@"))).toBeNull();
  });
});

describe("a stop taken out from its menu", () => {
  const route = { dep: "C81", stops: ["VPBNG", "KMSN", "VPBNG"], dest: "KDLH" };

  it("takes out the visit tapped, by its place, not every visit", () => {
    expect(withoutStop(route, "VPBNG", 3)).toEqual({ dep: "C81", stops: ["VPBNG", "KMSN"], dest: "KDLH" });
    expect(withoutStop(route, "VPBNG", 1)).toEqual({ dep: "C81", stops: ["KMSN", "VPBNG"], dest: "KDLH" });
  });

  it("takes out the first visit where no place is given or the place is another point's", () => {
    expect(withoutStop(route, "VPBNG")).toEqual({ dep: "C81", stops: ["KMSN", "VPBNG"], dest: "KDLH" });
    expect(withoutStop(route, "VPBNG", 2)).toEqual({ dep: "C81", stops: ["KMSN", "VPBNG"], dest: "KDLH" });
  });

  it("is not taken out where a point would follow itself, nor where it is no stop", () => {
    expect(withoutStop({ dep: "C81", stops: ["VPBNG", "KMSN", "VPBNG"], dest: "KDLH" }, "KMSN", 2)).toBeNull();
    expect(withoutStop(route, "KDLH", 4)).toBeNull();
  });

  it("leaves a local flight where the one stop of a round trip goes", () => {
    expect(withoutStop({ dep: "KDLH", stops: ["KMSN"], dest: "KDLH" }, "KMSN", 1)).toEqual({ dep: "KDLH", stops: [], dest: "KDLH" });
  });
});
