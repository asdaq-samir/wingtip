import { describe, expect, it, test } from "vitest";
import { callEngine, type EngineInput } from "../../lib/engine/engine";
import fixture from "../../lib/fixtures/goNoGoBrief.json";
import type { VerdictItem } from "../../lib/verdict";
import { glanceLines, type BriefGlance } from "./glance";

// The engine's rules as the web's build of it answers the shared cases
// (engine/facade/tests/gonogo_brief.rs reads the same file).
describe("the engine's gonogo_brief and gonogo_glance_lines", () => {
  test.each(fixture.brief)("$name", ({ input, answer }) => {
    expect(callEngine("gonogo_brief", input as unknown as EngineInput<"gonogo_brief">)).toEqual(answer);
  });
  test.each(fixture.glance)("$name", ({ input, answer }) => {
    expect(callEngine("gonogo_glance_lines", input as unknown as EngineInput<"gonogo_glance_lines">)).toEqual(answer);
  });
});

const item = (key: VerdictItem["key"], finding: VerdictItem["finding"], detail: string, label: string): VerdictItem => ({
  key,
  label,
  finding,
  detail,
  tab: "depart",
  section: "Takeoff",
});
const field = (ident: string, runway: string, crosswindKt: number) => ({
  ident,
  category: "VFR",
  at: null,
  runway,
  runwayFt: 3000,
  overFiftyFt: 1800,
  wind: "270/18",
  crosswindKt,
  crosswindOver: crosswindKt > 15,
  radio: null,
  finding: "caution" as const,
});
const glance: BriefGlance = {
  before: { spareGal: 12.4, balance: null, finding: "ok" },
  depart: field("C81", "27", 18),
  enroute: { ceilingFt: null, visibilitySm: null, wind: null, eteMin: null, line: null, finding: "ok" },
  arrive: null,
  outside: null,
  adiz: null,
  raw: { metars: [{ ident: "C81", raw: "METAR C81 ..." }], tafs: [], tfrs: [] },
};

describe("the Brief's lines at a glance, from the glance's figures", () => {
  it("hands the engine the fields' crosswinds and the reports as sent", () => {
    const { act, rest } = glanceLines([item("runways", "caution", "Crosswind past the POH's demonstrated at C81", "Runways")], glance);
    expect(act[0]).toMatchObject({
      key: "runways",
      tab: "depart",
      section: "Takeoff",
      line: "Runway 27 at C81 has 18 kt across, past the POH's demonstrated: ask for another runway, or wait for the wind",
      raw: ["METAR C81 ..."],
    });
    expect(rest.items).toEqual([]);
  });

  it("with no glance yet, words the engine's detail alone", () => {
    const { act } = glanceLines([item("runways", "caution", "Crosswind past the POH's demonstrated at C81", "Runways")], null);
    expect(act[0]!.lead).toBe("Crosswind past the POH's demonstrated at C81");
    expect(act[0]!.raw).toEqual([]);
  });
});
