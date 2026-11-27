import { describe, expect, it } from "vitest";
import { edgeOfPieces, type TilePiece } from "./tileEdge";

const E = 4096;
/** A square from (a, a) to (b, b) in a tile's units, closed. */
const square = (a: number, b: number) => [
  { x: a, y: a },
  { x: b, y: a },
  { x: b, y: b },
  { x: a, y: b },
  { x: a, y: a },
];

describe("a picked polygon's edge from its tiles' pieces", () => {
  it("is the ring whole where it lies inside one tile", () => {
    const edge = edgeOfPieces([{ rings: [square(1024, 3072)], extent: E, tile: { z: 0, x: 0, y: 0 } }]);
    expect(edge.coordinates).toHaveLength(1);
    expect(edge.coordinates[0]).toHaveLength(5);
    // A quarter of the way across the world at zoom 0: 90 W.
    expect(edge.coordinates[0]![0]![0]).toBeCloseTo(-90);
  });

  it("leaves out the cuts along a tile's edge and what lies in its buffer", () => {
    // A piece clipped by its tile with a 256-unit buffer: its left side is
    // the clip's cut, past the tile's edge; only the other three are the
    // polygon's own.
    const piece: TilePiece = {
      rings: [
        [
          { x: -256, y: 1000 },
          { x: 2000, y: 1000 },
          { x: 2000, y: 3000 },
          { x: -256, y: 3000 },
          { x: -256, y: 1000 },
        ],
      ],
      extent: E,
      tile: { z: 1, x: 1, y: 0 },
    };
    const edge = edgeOfPieces([piece]);
    // One line: the top from the tile's edge, the right side, the bottom back to it.
    expect(edge.coordinates).toHaveLength(1);
    const line = edge.coordinates[0]!;
    expect(line).toHaveLength(4);
    // Starting and ending on the tile's left edge, 0° at zoom 1's x = 1.
    expect(line[0]![0]).toBeCloseTo(0);
    expect(line.at(-1)![0]).toBeCloseTo(0);
  });

  it("draws nothing of a piece lying wholly in the buffer", () => {
    const edge = edgeOfPieces([{ rings: [square(-200, -10)], extent: E, tile: { z: 2, x: 1, y: 1 } }]);
    expect(edge.coordinates).toEqual([]);
  });
});
