import { describe, expect, it } from "vitest";
import type { Alternates } from "./api/types";
import { briefVerdict, type VerdictInput, type VerdictItem } from "./verdict";

const quiet: VerdictInput = {
  weather: { pending: false, failed: null, vfrNotRecommended: [], underMinimums: [], hazards: [], unchecked: [], worst: "3,500 ft · 6 sm" },
  airspace: { pending: false, unchecked: false, inForce: [], near: 0, specialUse: [] },
  altitude: { pending: false, problem: null, cautions: [], flown: "FL055 · Lowest" },
  fuel: { pending: false, marginGal: 12.4, requiredGal: 27.6, reserveMin: 30 },
  runways: { pending: false, worked: true, short: [], crosswind: [], beyond: [], unchecked: [] },
  balance: { pending: false, worked: true, problems: [], takeoff: "2,407 lb at 41.2 in" },
  risk: { level: "low", line: "Low · 2 points" },
};
// The Brief's Go / No-Go as the engine puts it together (gonogo_brief), with an airplane picked.
// Its rules, words and every boundary are the engine's, tested there
// (engine/facade/tests/gonogo/verdict_cases.rs, audit_cases.rs, gonogo_brief.rs
// and the shared fixtures/goNoGoBrief.json): here, that each field the page
// renames reaches the engine, and each argument and shape it reads back.
const verdict = (input: VerdictInput, more: Partial<Parameters<typeof briefVerdict>[0]> = {}) =>
  briefVerdict({ input, airplane: true, ...more });
const finding = (input: VerdictInput, key: string) => verdict(input).items.find((i) => i.key === key)!;

describe("the Go / No-Go", () => {
  it("finds nothing against a quiet day, every row saying what it checked", () => {
    const { items, line } = verdict(quiet);
    expect(items.map((i) => i.finding)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "ok"]);
    expect(items.find((i) => i.key === "fuel")!.detail).toBe("Needs 27.6 gal with taxi and a 30 min reserve; 12.4 gal beyond reserve");
    expect(line).toEqual({ finding: "ok", words: "Nothing found against this flight" });
  });

  it("is no-go as planned on VFR not recommended, a TFR in force, too little fuel or no altitude, naming each", () => {
    const { items, line } = verdict({
      ...quiet,
      weather: { ...quiet.weather, vfrNotRecommended: ["KDLH currently reporting IFR"] },
      airspace: { ...quiet.airspace, inForce: ["6/1111"] },
      fuel: { ...quiet.fuel, marginGal: -2.25 },
      altitude: { ...quiet.altitude, problem: "Ceiling 11,700 ft: terrain 40 nm past KDLH needs 12,500" },
    });
    expect(items.find((i) => i.key === "weather")!.detail).toBe("VFR not recommended: KDLH currently reporting IFR");
    expect(items.find((i) => i.key === "fuel")!.detail).toBe("2.3 gal short of the fuel and its 30 min reserve (14 CFR 91.151)");
    expect(line).toEqual({ finding: "stop", words: "No-go as planned: weather, TFRs & special use, altitude, fuel" });
  });

  it("under IFR cites the IFR reserve's rule", () => {
    const { items } = verdict({ ...quiet, fuel: { ...quiet.fuel, marginGal: -2.25, reserveMin: 45, ifr: true } });
    expect(items.find((i) => i.key === "fuel")!.detail).toBe("2.3 gal short of the fuel and its 45 min reserve (14 CFR 91.167)");
  });

  it("under IFR asks for another look at icing at the altitude flown, before the hazards it may come from", () => {
    const icing = "Icing possible at 6,000 ft: the freezing level at 5,000 ft, in cloud";
    const item = finding({ ...quiet, weather: { ...quiet.weather, icing, hazards: ["Icing G-AIRMET"] } }, "weather");
    expect(item).toMatchObject({ finding: "caution", detail: icing, section: "Adverse Conditions" });
    // Your own minimums come first.
    expect(finding({ ...quiet, weather: { ...quiet.weather, icing, underMinimums: ["KDLH 800 ft"] } }, "weather").finding).toBe("stop");
  });

  it("asks for another look at hazards, an area in use, a pilot's own altitude and a crosswind", () => {
    const input: VerdictInput = {
      ...quiet,
      weather: { ...quiet.weather, hazards: ["IFR G-AIRMET"] },
      airspace: { ...quiet.airspace, specialUse: [{ name: "VOLK EAST MOA", when: "active" }] },
      altitude: { ...quiet.altitude, cautions: ["Westbound above 3,000 ft flies even thousands plus 500 (14 CFR 91.159)"] },
      runways: { ...quiet.runways, crosswind: ["C81"] },
    };
    expect(finding(input, "airspace").detail).toBe("VOLK EAST MOA scheduled in use when you pass");
    expect(verdict(input).line.words).toBe("Look again at weather, TFRs & special use, altitude, runways");
  });

  it("says what is still coming", () => {
    const coming = verdict({ ...quiet, weather: { ...quiet.weather, pending: true }, risk: null });
    expect(coming.line).toEqual({ finding: "pending", words: "Still checking: weather, risk" });
  });

  it("adds the fields row after the tabs' for a private destination and a closed stop, none where every field is public", () => {
    const open = { private: false, military: null, phone: null, status: "O" };
    const ends = [
      { ident: "C81", role: "departure" as const, ...open },
      { ident: "KDLH", role: "destination" as const, ...open },
    ];
    expect(verdict(quiet, { fields: ends }).items.map((i) => i.key)).not.toContain("fields");
    const { items, line } = verdict(quiet, {
      fields: [
        ends[0]!,
        { ident: "00MO", role: "stop", ...open, status: "CI" },
        { ident: "IL11", role: "destination", ...open, private: true, phone: "847-323-8911" },
      ],
    });
    const row = items.at(-1)!;
    expect(row).toMatchObject({ key: "fields", finding: "caution" });
    expect(row.detail).toContain("00MO is closed indefinitely (NASR)");
    expect(row.detail).toContain("IL11 is private");
    expect(row.detail).toContain("847-323-8911");
    // The line weighs it as any other.
    expect(line.finding).toBe("caution");
  });

  it("leaves out the fuel, the runways and the weight and balance with no airplane picked", () => {
    expect(briefVerdict({ input: quiet, airplane: false }).items.map((i) => i.key)).toEqual(["weather", "airspace", "altitude", "risk"]);
  });
});

describe("the alternate in the Go / No-Go (14 CFR 91.169)", () => {
  const check = (good: boolean) => ({
    ident: "KMSN",
    approach: true,
    precision: true,
    minimums: { ceiling_ft: 600, visibility_sm: 2 },
    alternate_minimums_url: null,
    ceiling_ft: 1200,
    visibility_sm: 4,
    taf: null,
    good,
    meets_standard: true,
    reasons: [],
    distance_nm: 220,
  });
  const answer = (required: boolean, alternate: ReturnType<typeof check> | null): Alternates => ({
    destination: { ident: "KDLH", approach: true, ceiling_ft: 1500, visibility_sm: 4, taf: null, required, reasons: [] },
    alternate,
    suggestions: [],
  });
  const ifr = (weather: Partial<VerdictInput["weather"]> = {}): VerdictInput => ({
    ...quiet,
    weather: { ...quiet.weather, ifr: true, ...weather },
  });
  const weather = (input: VerdictInput, alternate?: Alternates): VerdictItem => verdict(input, { alternate }).items[0]!;

  it("says nothing while the answer is awaited or the one filed will do", () => {
    expect(weather(ifr()).finding).toBe("ok");
    expect(weather(ifr(), answer(true, check(true))).finding).toBe("ok");
  });

  it("asks for one where one is needed, and stops on one under its minimums, opening its section", () => {
    expect(weather(ifr(), answer(true, null))).toMatchObject({
      finding: "caution",
      detail: "An alternate is required (14 CFR 91.169): file one in Weather",
      tab: "arrive",
      section: "Alternate",
    });
    expect(weather(ifr(), answer(true, check(false))).finding).toBe("stop");
  });

  it("leaves the weather's own caution where its caution is no worse", () => {
    expect(weather(ifr({ hazards: ["IFR G-AIRMET"] }), answer(true, null)).detail).toBe("IFR G-AIRMET along the route");
  });
});
