import { describe, expect, it } from "vitest";
import { movePoint } from "./pointDrag";

describe("movePoint", () => {
  it("puts a point at another's place, the rest kept in order", () => {
    expect(movePoint(["C81", "KRYV", "KMSN", "KDLH"], 3, 0)).toEqual(["KDLH", "C81", "KRYV", "KMSN"]);
    expect(movePoint(["KDLH", "C81", "KRYV", "KMSN"], 0, 3)).toEqual(["C81", "KRYV", "KMSN", "KDLH"]);
    expect(movePoint(["A", "B", "C"], 1, 2)).toEqual(["A", "C", "B"]);
  });
});
