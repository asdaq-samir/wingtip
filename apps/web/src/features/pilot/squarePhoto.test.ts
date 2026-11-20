import { describe, expect, it } from "vitest";
import { centreSquare } from "./squarePhoto";

describe("centreSquare", () => {
  it("keeps the middle of a wide photo, its height across", () => {
    expect(centreSquare(4032, 3024)).toEqual({ x: 504, y: 0, side: 3024 });
  });

  it("keeps the middle of a tall photo, its width across", () => {
    expect(centreSquare(3024, 4032)).toEqual({ x: 0, y: 504, side: 3024 });
  });

  it("keeps a square photo whole", () => {
    expect(centreSquare(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });
});
