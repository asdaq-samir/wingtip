import { describe, expect, it } from "vitest";
import { shortType } from "./shortType";

describe("an airplane's type in a few words", () => {
  it("is its maker without the company's words and its model without the variant", () => {
    expect(shortType("AIRBUS S A S", "A321-271NX")).toBe("Airbus A321");
    expect(shortType("Airbus S A S", "A321-271NX")).toBe("Airbus A321");
    expect(shortType("BOEING", "737-8H4")).toBe("Boeing 737");
    expect(shortType("PIPER AIRCRAFT INC", "PA-28-140")).toBe("Piper PA-28");
    expect(shortType("CESSNA", "172S")).toBe("Cessna 172S");
    expect(shortType("DE HAVILLAND", "DHC-6")).toBe("De Havilland DHC-6");
    expect(shortType("CIRRUS DESIGN CORP", "SR22")).toBe("Cirrus SR22");
  });

  it("says what it has, and nothing with neither", () => {
    expect(shortType(null, "A321-271NX")).toBe("A321");
    expect(shortType("PIPER", null)).toBe("Piper");
    expect(shortType(null, null)).toBeNull();
  });
});
