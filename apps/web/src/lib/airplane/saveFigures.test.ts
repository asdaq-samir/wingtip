import { describe, expect, it } from "vitest";
import { readFigure, tablesWords } from "./figureWords";
import { NO_TYPE_DESIGNATOR, deviceWith, figuresOnly, fromDevice, newRecord, recordWith } from "./saveFigures";
import { C172, record } from "./testAirplanes";

describe("saving a pilot's figures", () => {
  it("adds an inline ask's figure alone (PUT .../figures)", () => {
    expect(figuresOnly({ taxi_fuel_gal: 1.2 })).toEqual({
      serviceCeilingFt: null,
      climbRateFpm: null,
      taxiFuelGal: 1.2,
      glideRatio: null,
      emptyWeightLb: null,
      emptyMomentLbIn: null,
    });
    // A reset, or a figure the record keeps beside its OwnFigures: the record again.
    expect(figuresOnly({ taxi_fuel_gal: null })).toBeNull();
    expect(figuresOnly({ cruise_tas_kt: 118 })).toBeNull();
  });

  it("puts the book's cruise back on a reset, and clears an own figure", () => {
    const kept = record({ cruiseTasKt: 115, figures: { ...record().figures, glideRatio: 8.5 } });
    const request = recordWith(kept, { cruise_tas_kt: null, glide_ratio: null }, C172);
    expect(request.cruiseTasKt).toBe(122);
    expect(request.figures?.glideRatio).toBeNull();
    expect(request.fuelBurnGph).toBe(8.4);
  });

  it("makes a record at the first edit on the type's book figures", () => {
    const request = newRecord("n123ab", null, C172, undefined, { taxi_fuel_gal: 1 })!;
    expect(request).toMatchObject({ tailNumber: "N123AB", typeDesignator: "C172", cruiseTasKt: 122, fuelBurnGph: 8.4 });
    expect(request.figures?.taxiFuelGal).toBe(1);
  });

  it("asks for the cruise and burn first where no book has them", () => {
    expect(newRecord("N9", null, null, undefined, { glide_ratio: 9 })).toBeNull();
    const request = newRecord("N9", null, null, { cruiseTasKt: 100, fuelBurnGph: 7 }, { glide_ratio: 9 })!;
    expect(request.typeDesignator).toBe(NO_TYPE_DESIGNATOR);
    expect(request.figures?.glideRatio).toBe(9);
  });

  it("keeps them on the device signed out, a reset taking one away", () => {
    const kept = deviceWith({ cruiseTasKt: 110 }, { glide_ratio: 9, cruise_tas_kt: null });
    expect(kept).toEqual({ glideRatio: 9 });
    expect(fromDevice(kept)).toEqual({ glide_ratio: 9 });
  });
});

describe("a figure typed", () => {
  it("is held to the record's bounds", () => {
    expect(readFigure("taxi_fuel_gal", 1.4)).toEqual({ value: 1.4 });
    expect(readFigure("taxi_fuel_gal", 0)).toEqual({ value: 0 });
    expect(readFigure("glide_ratio", 1)).toHaveProperty("problem");
    expect(readFigure("service_ceiling_ft", 14000)).toEqual({ value: 14000 });
    expect(readFigure("service_ceiling_ft", 40000)).toHaveProperty("problem");
    expect(readFigure("empty_weight_lb", null)).toHaveProperty("problem");
  });

  it("names the tables a figure needs", () => {
    expect(tablesWords(["takeoff", "landing"])).toBe("takeoff chart and landing chart");
    expect(tablesWords(["loading"])).toBe("loading envelope");
  });
});
