import { describe, expect, it } from "vitest";
import { rgbOf } from "./rgb";

describe("a hex colour as its channels", () => {
  it("reads each pair, either case", () => {
    expect(rgbOf("#e600e6")).toEqual([230, 0, 230]);
    expect(rgbOf("#0B0F0A")).toEqual([11, 15, 10]);
  });

  it("leaves an 8-digit hex's alpha to the caller", () => {
    expect(rgbOf("#2f8cffbf")).toEqual([47, 140, 255]);
  });
});
