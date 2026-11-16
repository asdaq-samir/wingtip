import { describe, expect, it } from "vitest";
import { drawnStretch } from "./heightStretch";

describe("the 3D view's heights", () => {
  it("are drawn at the pilot's Heights, but true in the pilot's and the replay cameras' views", () => {
    expect(drawnStretch(3, false)).toBe(3);
    expect(drawnStretch(5, false)).toBe(5);
    // From the airplane the ground is read for clearance: never stretched.
    expect(drawnStretch(3, true)).toBe(1);
    expect(drawnStretch(5, true)).toBe(1);
  });
});
