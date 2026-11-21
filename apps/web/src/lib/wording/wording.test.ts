import { describe, expect, it } from "vitest";
import { EXPLAINED } from "../explain";
import { LEGAL_PAGES } from "../legal";
import { ALLOWANCES } from "../diversion";
import { FIGURE_WORDS } from "../airplane/figureWords";
import { WORDING } from "./generated/wording";
import { isTitleCase } from "./titleCase";

// The words every app says the same are design/wording.json's, generated
// into WORDING (docs/design/rules.md, section 15): a caller that wrote its
// own copy could drift from the phones' words, so each says WORDING's.

describe("figure names", () => {
  it("say WORDING's name where WORDING has one", () => {
    expect(EXPLAINED.MH.name).toBe(WORDING.magneticHeading);
    expect(EXPLAINED.GS.name).toBe(WORDING.groundSpeed);
    expect(EXPLAINED.TAS.name).toBe(WORDING.trueAirspeed);
    expect(EXPLAINED.TOC.name).toBe(WORDING.topOfClimb);
    expect(FIGURE_WORDS.fuel_burn_gph.label).toBe(WORDING.fuelBurn);
    expect(FIGURE_WORDS.usable_fuel_gal.label).toBe(WORDING.usableFuel);
    expect(FIGURE_WORDS.empty_weight_lb.label).toBe(WORDING.emptyWeight);
    expect(ALLOWANCES.find((a) => a.key === "gs")!.label).toBe(WORDING.groundSpeed);
  });

  it("are in Title Case", () => {
    const names = [
      ...Object.values(EXPLAINED).map((e) => e.name),
      ...Object.values(FIGURE_WORDS).map((f) => f.label),
      ...ALLOWANCES.map((a) => a.label),
      ...LEGAL_PAGES.map((p) => p.title),
    ];
    expect(names.filter((name) => !isTitleCase(name))).toEqual([]);
  });
});

describe("isTitleCase", () => {
  it("takes Apple's title style and refuses sentence case", () => {
    expect(isTitleCase("Read from a Photo")).toBe(true);
    expect(isTitleCase("Cross At")).toBe(true);
    expect(isTitleCase("Time En Route")).toBe(true);
    expect(isTitleCase("Empty weight")).toBe(false);
    expect(isTitleCase("Read From a Photo")).toBe(false);
  });
});

describe("WORDING's sentences", () => {
  it("end with a full stop and say could not, never couldn't", () => {
    const errors = Object.entries(WORDING).filter(([key]) => /Not(Fetched|Reached|Read|Checked|Loaded|LookedUp|Found)$|NoAnswer$/.test(key));
    expect(errors.length).toBeGreaterThan(0);
    for (const [, words] of errors) {
      expect(words).toMatch(/\.$/);
      expect(words).not.toMatch(/n['’]t\b/);
    }
  });

  it("write progress as Fetching and one ellipsis character", () => {
    const progress = Object.entries(WORDING).filter(([key]) => key.startsWith("fetching"));
    for (const [, words] of progress) expect(words).toMatch(/^Fetching [^.]+…$/);
  });
});
