import { describe, expect, it } from "vitest";
import { nthTyped } from "./visits";

describe("nthTyped", () => {
  const route = ["C81", "VPBNG", "KMSN", "VPBNG", "KDLH"];

  it("finds each visit of a fix flown twice at its own place", () => {
    expect(nthTyped(route, "VPBNG", 0)).toBe(1);
    expect(nthTyped(route, "VPBNG", 1)).toBe(3);
  });

  it("is -1 past the last visit and for a point not typed", () => {
    expect(nthTyped(route, "VPBNG", 2)).toBe(-1);
    expect(nthTyped(route, "V100", 0)).toBe(-1);
  });

  it("never answers the departure, a field's own step", () => {
    expect(nthTyped(["C81", "KMSN", "C81"], "C81", 0)).toBe(2);
  });
});
