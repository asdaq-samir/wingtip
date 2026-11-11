import { describe, expect, it } from "vitest";
import { cardOpening } from "./sheetCards";

describe("cardOpening", () => {
  it("opens at its opener's size whatever it covers", () => {
    expect(cardOpening({ opens: "half" }, "full")).toBe("half");
    expect(cardOpening({ opens: "full" }, "peek")).toBe("full");
  });

  it("else as high as what it covers, half at the least (the card rule's 2)", () => {
    expect(cardOpening({}, "peek")).toBe("half");
    expect(cardOpening({}, "half")).toBe("half");
    expect(cardOpening({}, "full")).toBe("full");
    expect(cardOpening({ raise: "full" }, "peek")).toBe("full");
  });
});
