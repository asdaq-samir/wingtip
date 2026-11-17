import { describe, expect, it } from "vitest";
import { figureRoom } from "./figureRoom";

describe("figureRoom", () => {
  it("is the widest figure's room, its unit at its share of the size", () => {
    const short = figureRoom([{ value: "2h 45m" }, { value: "324", unit: "nm" }], 0.65);
    const long = figureRoom([{ value: "13h 38m" }, { value: "324", unit: "nm" }], 0.65);
    expect(long).toBeGreaterThan(short);
    // "13h 38m": four digits, an h a digit wide, a gap and a wide m, a shade over.
    expect(long).toBeCloseTo((5 + 0.42 + 1.6) * 1.03, 2);
  });

  it("leaves room for the warning mark and a figure still coming", () => {
    expect(figureRoom([{ value: "30.1", alert: true }], 0.65)).toBeGreaterThan(figureRoom([{ value: "30.1" }], 0.65));
    expect(figureRoom([{ value: "—", waiting: true }], 0.65)).toBe(4.12);
  });
});
