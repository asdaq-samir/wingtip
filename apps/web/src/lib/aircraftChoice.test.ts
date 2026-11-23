import { describe, expect, it } from "vitest";
import { aircraftKey, N_NUMBER, profileOfRegistered, tailChoice } from "./aircraftChoice";

// 14 CFR 47.15's shapes and the registry's types are the engine's, each
// case tested there (engine/facade/tests/aircraft.rs): here, that the text
// and the maker, model and year reach it.
describe("an airplane picked by its N-number", () => {
  it("is told from other words by its shape (14 CFR 47.15)", () => {
    expect(N_NUMBER.test("N3429J")).toBe(true);
    expect(N_NUMBER.test("C172")).toBe(false);
  });

  it("flies on its type's stock profile where there is one, and none for another type", () => {
    expect(profileOfRegistered({ manufacturer: "Cessna", model: "172S" })).toBe("c172");
    // The year sent: the PA-28-140 of 1971, and the Cruiser's of 1975.
    expect(profileOfRegistered({ manufacturer: "Piper", model: "PA-28-140", year: 1971 })).toBe("pa28140");
    expect(profileOfRegistered({ manufacturer: "Piper", model: "PA-28-140", year: 1975 })).toBe("pa28140cruiser");
    expect(profileOfRegistered({ manufacturer: "Beech", model: "A36" })).toBeNull();
  });

  it("has its own place in the picker beside the stock profile it flies on", () => {
    expect(aircraftKey({ profile: "c172", label: "N12345 · C172", tail: "N12345" })).toBe("tail:N12345");
    expect(aircraftKey({ profile: "c172", label: "C172 · Cessna 172" })).toBe("profile:c172");
    expect(aircraftKey({ profile: "c172", label: "N2 · C172", aircraftId: 7 })).toBe("mine:7");
  });
});

describe("an airplane flown by its N-number (Fly This Airplane, the picker)", () => {
  it("rides on its type's book under its N-number, the pilot's own figures over it", () => {
    expect(tailChoice("N3429J", "pa28")).toEqual({ profile: "pa28", label: "N3429J · PA28", tail: "N3429J" });
    expect(tailChoice("N3429J", "pa28", { fuelBurnGph: 9.5 }).fuelBurnGph).toBe(9.5);
  });

  it("is its N-number alone where its type has no book: nothing assumed", () => {
    expect(tailChoice("N130SH", "")).toEqual({ profile: "", label: "N130SH", tail: "N130SH" });
  });
});
