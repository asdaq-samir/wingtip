import { describe, expect, it } from "vitest";
import { outsideOfTurn, turnSide } from "./routeTurns";
import { routeMarks } from "./routeMarks";

// [lat, lon] points, as the planner sends a course line.
const POS0: [number, number] = [41.0, -88.0];
const WETEV: [number, number] = [41.0, -87.0];
const KMYJ: [number, number] = [40.0, -87.0];
const at = ([lat, lon]: [number, number]) => ({ lat, lon });

describe("outsideOfTurn", () => {
  it("puts the name away from the turn: east then south turns right, the name up and to the right", () => {
    // In from the west, out to the south: the turn's inside is down-left.
    expect(outsideOfTurn([POS0, WETEV, KMYJ], at(WETEV))).toBe(45);
  });

  it("puts a straight point's name square to the course, on its upper side", () => {
    const east: [number, number] = [41.0, -86.0];
    expect(outsideOfTurn([POS0, WETEV, east], at(WETEV))).toBe(0);
  });

  it("puts the route's first point's name square to its one leg, off own ship's line", () => {
    // The first leg runs east from POS0: the name above it, not behind or ahead.
    expect(outsideOfTurn([POS0, WETEV, KMYJ], at(POS0))).toBe(0);
    // A first leg running south: the name to its side, not on the line.
    expect([90, 270]).toContain(outsideOfTurn([WETEV, KMYJ], at(WETEV)));
  });

  it("finds the turn on a densified line, past a repeated vertex", () => {
    const mid: [number, number] = [41.0, -87.5];
    expect(outsideOfTurn([POS0, mid, WETEV, WETEV, [40.5, -87.0], KMYJ], at(WETEV))).toBe(45);
  });
});

describe("turnSide", () => {
  const pick = (layout: unknown, out: number) => {
    // The expression's sector, read the way MapLibre reads it.
    const sector = Math.round(((((out + 720 - 0) % 360) + 360) % 360) / 45) % 8;
    const match = (layout as unknown[]).slice(2);
    return match[match.indexOf(sector) + 1];
  };

  it("anchors the name on its side facing the point", () => {
    const side = turnSide(0);
    expect(pick(side["text-anchor"], 0)).toBe("bottom");
    expect(pick(side["text-anchor"], 45)).toBe("bottom-left");
    expect(pick(side["text-anchor"], 180)).toBe("top");
    expect(pick(side["text-offset"], 90)).toEqual(["literal", [1.4, 0]]);
  });

  it("takes the map's bearing off the side", () => {
    expect(JSON.stringify(turnSide(90)["text-anchor"])).toContain("630");
  });
});

describe("routeMarks", () => {
  it("draws a waypoint as a ringed dot with its name pill and side, an airport as its own mark", () => {
    const point = { lat: WETEV[0], lon: WETEV[1], colour: "#000", space: null, select: () => {} };
    const marks = routeMarks(
      [
        { ...point, ident: "WETEV", fix: true },
        { ...point, ident: "KMYJ", lat: KMYJ[0], lon: KMYJ[1], fix: false },
      ],
      [],
      [POS0, WETEV, KMYJ],
      "#e600e6",
    );
    expect(marks[0]!.picture!.id).toBe("turn-dot|#e600e6");
    expect(marks[0]!.also!.map((p) => p.id)).toEqual(["route-point-pill"]);
    expect(marks[0]!.props).toMatchObject({ kind: "fix", out: 45 });
    expect(marks[1]!.props).toMatchObject({ kind: "field" });
    expect(marks[1]!.props).not.toHaveProperty("out");
  });
});
