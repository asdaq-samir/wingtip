import { describe, expect, it } from "vitest";
import { airplaneFigures, handbookOf } from "../../lib/airplane/figures";
import { C172, record } from "../../lib/airplane/testAirplanes";
import { firstKept } from "./useKeepFiguresOffer";
import { figureText, ownOfRecord, ownWith, resettable, sourceWords, typeWords } from "./profileModel";

describe("the airplane profile", () => {
  it("labels each figure by its source, and offers the book's back over the pilot's", () => {
    const kept = record({ cruiseTasKt: 118, usableFuelGal: 53, handbook: { usable_fuel_gal: 50 } as never });
    const figures = airplaneFigures(C172, handbookOf(kept.handbook), ownOfRecord(kept));
    const by = Object.fromEntries(figures.figures.map((f) => [f.key, f]));
    expect(sourceWords(by.cruise_tas_kt!.source)).toBe("You");
    expect(resettable(by.cruise_tas_kt!)).toBe(true);
    expect(sourceWords(by.fuel_burn_gph!.source)).toBe("Book");
    expect(resettable(by.fuel_burn_gph!)).toBe(false);
    // No book figure for an empty weight: missing, nothing to reset to.
    expect(sourceWords(by.empty_weight_lb!.source)).toBe("Missing");
    expect(resettable(by.empty_weight_lb!)).toBe(false);
  });

  it("says the photographed page's figure where the pilot gave none", () => {
    const figures = airplaneFigures(C172, { usableFuelGal: { value: 50 } }, null);
    expect(sourceWords(figures.figures.find((f) => f.key === "usable_fuel_gal")!.source)).toBe("Handbook photo");
  });

  it("names the type from the record, else the FAA registry, else the book", () => {
    expect(typeWords(record(), null, null)).toBe("C172");
    expect(typeWords(null, { manufacturer: "PIPER", model: "PA-28-181", year: 1979 }, "Piper Archer")).toBe("PIPER PA-28-181, 1979");
    expect(typeWords(null, null, "Cessna 172S")).toBe("Cessna 172S");
    expect(typeWords(null, null, null)).toBeNull();
  });

  it("writes a figure for its field", () => {
    expect(figureText("glide_ratio", 9)).toBe("9.0");
    expect(figureText("cruise_tas_kt", 122.04)).toBe("122");
    expect(figureText("taxi_fuel_gal", null)).toBe("");
  });

  it("offers the first N-number this device kept figures for at sign-in", () => {
    expect(firstKept({})).toBeNull();
    expect(firstKept({ N1: {}, N123AB: { glideRatio: 9 } })).toBe("N123AB");
  });
});

describe("the figures shown while a change is saved", () => {
  it("puts a figure given over the pilot's own and takes a reset one out", () => {
    const own = { taxi_fuel_gal: 1.1, glide_ratio: 9 };
    expect(ownWith(own, { taxi_fuel_gal: 1.4 })).toEqual({ taxi_fuel_gal: 1.4, glide_ratio: 9 });
    expect(ownWith(own, { glide_ratio: null })).toEqual({ taxi_fuel_gal: 1.1 });
    expect(own).toEqual({ taxi_fuel_gal: 1.1, glide_ratio: 9 });
  });
});
