import { describe, expect, it } from "vitest";
import { rgbOf, withAlpha } from "./rgb";

describe("a hex colour as its channels", () => {
  it("reads each pair, either case", () => {
    expect(rgbOf("#e600e6")).toEqual([230, 0, 230]);
    expect(rgbOf("#0B0F0A")).toEqual([11, 15, 10]);
  });

  it("leaves an 8-digit hex's alpha to the caller", () => {
    expect(rgbOf("#2f8cffbf")).toEqual([47, 140, 255]);
  });
});

describe("a hex colour with an alpha", () => {
  it("adds the alpha as a byte, and leaves a solid or a non-hex colour as it is", () => {
    expect(withAlpha("#e600e6", 0.6)).toBe("#e600e699");
    expect(withAlpha("#ffffff", 0.05)).toBe("#ffffff0d");
    expect(withAlpha("#e600e6", 1)).toBe("#e600e6");
    expect(withAlpha("red", 0.5)).toBe("red");
  });
});
