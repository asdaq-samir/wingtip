import { describe, expect, it } from "vitest";
import { headingWords, outlineRows, pinchStep, rowFor, spread } from "./pdfPlaces";

const outline = [
  {
    title: "Chapter 7. Safety of Flight",
    dest: "c7",
    items: [
      {
        title: "Section 1. Meteorology",
        dest: "s1",
        items: [
          { title: "7–1–5. Preflight Briefings", dest: "p5", items: [] },
          { title: "7-1-50. Something Later", dest: "p50", items: [] },
        ],
      },
    ],
  },
];

describe("the reader's way about a PDF", () => {
  it("flattens the outline in its order with each row's depth", () => {
    expect(outlineRows(outline).map((r) => [r.dest, r.depth])).toEqual([
      ["c7", 0],
      ["s1", 1],
      ["p5", 2],
      ["p50", 2],
    ]);
    expect(outlineRows(null)).toEqual([]);
  });

  it("finds an AIM paragraph by its number, its dashes as the PDF sets them, not a longer number", () => {
    const rows = outlineRows(outline);
    expect(rowFor(rows, "7-1-5")?.dest).toBe("p5");
    expect(rowFor(rows, "7-1-50")?.dest).toBe("p50");
    expect(rowFor(rows, "7-1-6")).toBeNull();
    expect(headingWords("7-1-6")).toBe("7-1-6.");
  });

  it("zooms a pinch by the fingers' spread, held to doubling or halving a step", () => {
    expect(pinchStep(100, 150)).toBe(1.5);
    expect(pinchStep(100, 400)).toBe(2);
    expect(pinchStep(100, 10)).toBe(0.5);
    expect(pinchStep(0, 100)).toBe(1);
    expect(spread({ clientX: 0, clientY: 0 }, { clientX: 30, clientY: 40 })).toEqual({ distance: 50, origin: [15, 20] });
  });
});
