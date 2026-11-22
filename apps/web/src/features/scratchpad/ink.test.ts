import { describe, expect, it } from "vitest";
import { draws, pressureOf, strokePath } from "./ink";

describe("who writes on the scratchpad", () => {
  it("takes a pen always, a finger only until a pen has written, never a second finger", () => {
    expect(draws("pen", false, true)).toBe(true);
    expect(draws("pen", true, false)).toBe(true);
    expect(draws("touch", false, true)).toBe(true);
    expect(draws("mouse", false, true)).toBe(true);
    // A palm resting while the Pencil writes: no ink.
    expect(draws("touch", true, true)).toBe(false);
    expect(draws("touch", false, false)).toBe(false);
  });

  it("reads a pen's pressure, none from a finger", () => {
    expect(pressureOf("pen", 0.8)).toBe(0.8);
    expect(pressureOf("pen", 0)).toBe(0.5);
    expect(pressureOf("touch", 1)).toBe(0.5);
  });
});

describe("a stroke's outline", () => {
  it("is a closed path round its points, drawn at the page's width", () => {
    const d = strokePath(
      {
        points: [
          [0.1, 0.1, 0.5],
          [0.2, 0.15, 0.5],
          [0.3, 0.2, 0.5],
        ],
        pen: false,
      },
      1000,
      6,
    );
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    // Round x from 100 to 300 at a width of 1000, a nib's width either side.
    const xs = [...d.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThan(90);
    expect(Math.max(...xs)).toBeLessThan(310);
  });
});
