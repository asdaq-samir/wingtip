import { describe, expect, it } from "vitest";
import { fieldSide, routeMarks } from "./routeMarks";

const field = (ident: string, lat: number, lon: number) => ({ ident, lat, lon, colour: "#000", space: null, fix: false, select: () => {} });

describe("a route field's ident", () => {
  it("goes first to the side nearest outside the turn", () => {
    expect(fieldSide(0)).toBe("bottom"); // above the field
    expect(fieldSide(80)).toBe("left"); // east of it
    expect(fieldSide(190)).toBe("top"); // under it
    expect(fieldSide(275)).toBe("right"); // west of it
    expect(fieldSide(350)).toBe("bottom");
  });

  it("is put off a leg running east to west, not along it (KAHQ's pill over the leg from KUGN, 2026-11-23)", () => {
    // KUGN, KAHQ, KLAS: the course west from Waukegan; at Wahoo the pill
    // east of the field lay along the leg it came in on.
    const ends = [field("KUGN", 42.42, -87.87), field("KAHQ", 41.24, -96.59), field("KLAS", 36.08, -115.15)];
    const line: [number, number][] = ends.map((e) => [e.lat, e.lon]);
    const marks = routeMarks(ends, [], line);
    const side = (ident: string) => fieldSide(Number(marks.find((m) => m.key === ident)?.props?.out));
    // The course bends south at Wahoo: its outside is to the north.
    expect(side("KAHQ")).toBe("bottom");
    // Each end square to its leg, on the upper side: above, off the line.
    expect(side("KUGN")).toBe("bottom");
    expect(side("KLAS")).toBe("bottom");
  });
});
