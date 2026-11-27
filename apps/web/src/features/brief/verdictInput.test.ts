import { describe, expect, it } from "vitest";
import type { Briefing, NavLogAltitude } from "../../lib/api/types";
import { briefVerdict } from "../../lib/verdict";
import { verdictInput } from "./verdictInput";

type Inputs = Parameters<typeof verdictInput>[0];
type Check = Inputs["checks"][number];

const distance = (over: Partial<Check["distances"][number]>) =>
  ({ kind: "takeoff", over: false, unknown: false, beyond: false, close: false, ...over }) as Check["distances"][number];
const check = (ident: string, over: Partial<Check>): Check =>
  ({ field: { ident }, headwindKt: 5, crosswindOver: false, unchecked: null, distances: [], ...over }) as Check;
const table = { weights_lb: [2550], tables: [{ ground_roll_ft: [], total_50ft_ft: [] }] };

const inputs = (over: Partial<Inputs>): Inputs =>
  ({
    briefing: {
      weather_unavailable: [],
      vfr_not_recommended: [],
      metars: {},
      forecast: { min_ceiling_ft: null, min_visibility_sm: null },
    } as unknown as Briefing,
    failed: null,
    ifr: false,
    landings: ["C81", "KDLH"],
    underMine: [],
    icingLines: [],
    icingError: false,
    hazardNames: [],
    itwsAlerts: undefined,
    flowPrograms: undefined,
    routeFigures: {
      least_margin_gal: null,
      required_gal: null,
      reserve_min: null,
      tfrs_in_force: [],
      tfrs_near: 0,
      vfr_not_recommended: [],
      hazard_count: 0,
    },
    specialUse: [],
    nav: {
      flown: "custom",
      altitude_ft: 5500,
      options: [],
      cautions: [],
      aircraft: { takeoff: table, landing: table },
    } as unknown as NavLogAltitude,
    problem: null,
    legs: [],
    checks: [],
    loading: null,
    loaded: null,
    totals: null,
    ...over,
  }) as Inputs;

// The facts go to the engine as they are (gonogo_brief's `facts`, built
// by gonogo_input, held to fixtures/rules/gonogo.json): here, that the
// page's own answers reach it in its names.
describe("verdictInput's facts", () => {
  it("passes each runway check on in the engine's names, and the engine finds them", () => {
    const checks = [
      check("KAAA", { headwindKt: -3, distances: [distance({ over: true })] }),
      check("KBBB", { crosswindOver: true, distances: [distance({ beyond: true })] }),
    ];
    const facts = verdictInput(inputs({ checks }));
    expect(facts.runway_checks).toEqual([
      { ident: "KAAA", headwind_kt: -3, crosswind_over: false, unchecked: null, distances: [distance({ over: true })] },
      { ident: "KBBB", headwind_kt: 5, crosswind_over: true, unchecked: null, distances: [distance({ beyond: true })] },
    ]);
    const runways = briefVerdict({ facts, risk: null, airplane: true }).items.find((i) => i.key === "runways")!;
    expect(runways.finding).not.toBe("ok");
  });

  it("sends the briefing's METARs and the fields landed at, for the engine to find a ceiling with no height", () => {
    const briefing = { ...inputs({}).briefing, metars: { KDLH: { ceiling_unknown: true } } } as unknown as Briefing;
    const facts = verdictInput(inputs({ briefing }));
    expect([facts.landings, facts.metars]).toEqual([["C81", "KDLH"], { KDLH: { ceiling_unknown: true } }]);
    const weather = briefVerdict({ facts, risk: null, airplane: true }).items.find((i) => i.key === "weather")!;
    expect(weather.detail).toBe("Not checked: the ceiling at KDLH");
  });
});
