import { describe, expect, it } from "vitest";
import { choiceOf, glideRatioOf, taxiFuelOf } from "../aircraftChoice";
import { airplaneQuery, plannerAircraft } from "../api/airplaneQuery";
import { OWN_AIRPLANE, figureValue, figuresOfChoice, needsOf, ownOf } from "./figures";
import { missingFor } from "./useAskFigure";
import { C172, record } from "./testAirplanes";

const source = (key: string, f: ReturnType<typeof figuresOfChoice>) => f.figures.find((x) => x.key === key)?.source;

describe("an own airplane of no stock type", () => {
  const piper = record({ typeDesignator: "P28X", cruiseTasKt: 110, fuelBurnGph: 9 });

  it("is planned as 'own' on its record's figures, never on a 172", () => {
    const choice = choiceOf(piper, [C172]);
    expect(choice.profile).toBe(OWN_AIRPLANE);
    expect(plannerAircraft(choice)).toBe("own");
    const figures = figuresOfChoice(choice, [C172]);
    expect(figureValue(figures, "cruise_tas_kt")).toBe(110);
    // No 172 ceiling, taxi allowance or glide under it.
    expect(figureValue(figures, "service_ceiling_ft")).toBeNull();
    expect(taxiFuelOf(choice, [C172])).toBeNull();
    expect(glideRatioOf(choice, [C172])).toBeNull();
  });

  it("carries every figure its record has to the planner", () => {
    const choice = choiceOf(
      record({
        typeDesignator: "P28X",
        figures: {
          serviceCeilingFt: 11000,
          climbRateFpm: 640,
          taxiFuelGal: 1.1,
          glideRatio: 10.5,
          emptyWeightLb: 1500,
          emptyMomentLbIn: 130000,
        },
      }),
      [C172],
    );
    expect(airplaneQuery(choice)).toMatchObject({
      aircraft: "own",
      service_ceiling_ft: 11000,
      climb_rate_fpm: 640,
      taxi_fuel_gal: 1.1,
      glide_ratio: 10.5,
    });
    expect(ownOf(choice)).toMatchObject({ empty_weight_lb: 1500, empty_moment_lb_in: 130000 });
  });

  it("asks for the start and taxi fuel the totals need, and its glide ratio", () => {
    const profile = figuresOfChoice(choiceOf(piper, [C172]), [C172]).profile as Record<string, unknown>;
    expect(needsOf(profile, "fuel_totals")).toEqual(["taxi_fuel_gal"]);
    expect(needsOf(profile, "glide")).toEqual(["glide_ratio"]);
  });
});

describe("a stock type's airplane", () => {
  it("flies its type's book with the pilot's figures over it, each sourced", () => {
    const choice = choiceOf(record({ figures: { ...record().figures, taxiFuelGal: 2 } }), [C172]);
    expect(choice.profile).toBe("c172");
    const figures = figuresOfChoice(choice, [C172]);
    expect(figureValue(figures, "taxi_fuel_gal")).toBe(2);
    expect(source("taxi_fuel_gal", figures)).toBe("pilot");
    // The record's cruise is the book's: still the book's.
    expect(source("cruise_tas_kt", figures)).toBe("book");
    expect(glideRatioOf(choice, [C172])).toBe(9);
  });

  it("takes its tables from the nav log's airplane when asked what a weight and balance lacks", () => {
    const profile = figuresOfChoice(choiceOf(record(), [C172]), [C172]).profile as Record<string, unknown>;
    expect(missingFor("weight_balance", profile, null)).toContain("loading");
    expect(missingFor("weight_balance", profile, { loading: {} })).not.toContain("loading");
    expect(missingFor("fuel_totals", profile, null)).toEqual([]);
  });
});

describe("no airplane", () => {
  it("has no figures and needs an airplane", () => {
    const figures = figuresOfChoice({ profile: "", label: "", none: true }, [C172]);
    expect(figures.profile).toBeNull();
    expect(needsOf(figures.profile, "glide")).toEqual(["airplane"]);
    expect(plannerAircraft({ profile: "", label: "", none: true })).toBeUndefined();
  });

  it("plans an N-number of no known type on the pilot's own speed and burn alone", () => {
    expect(plannerAircraft({ profile: "", label: "N9", tail: "N9" })).toBeUndefined();
    expect(plannerAircraft({ profile: "", label: "N9", tail: "N9", cruiseTasKt: 100, fuelBurnGph: 7 })).toBe("own");
  });
});
