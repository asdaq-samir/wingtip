import { describe, expect, it } from "vitest";
import type { Briefing, NavLogAltitude } from "../../lib/api/types";
import { verdictInput } from "./verdictInput";

type Inputs = Parameters<typeof verdictInput>[0];
type Check = Inputs["checks"][number];

const distance = (over: Partial<Check["distances"][number]>) =>
  ({ kind: "takeoff", over: false, unknown: false, beyond: false, close: false, ...over }) as Check["distances"][number];
const check = (ident: string, over: Partial<Check>): Check =>
  ({ field: { ident }, headwindKt: 5, crosswindOver: false, unchecked: null, distances: [], ...over }) as Check;

const inputs = (over: Partial<Inputs>): Inputs =>
  ({
    briefing: { weather_unavailable: [], forecast: { min_ceiling_ft: null, min_visibility_sm: null } } as unknown as Briefing,
    failed: null,
    ifr: false,
    vnrReasons: [],
    underMine: [],
    icingLines: [],
    icingError: false,
    hazardNames: [],
    itwsAlerts: undefined,
    flowPrograms: undefined,
    routeFigures: { least_margin_gal: null, required_gal: null, reserve_min: null, tfrs_in_force: [], tfrs_near: 0 },
    specialUse: [],
    tfrsUnchecked: false,
    nav: {
      flown: "custom",
      altitude_ft: 5500,
      options: [],
      cautions: [],
      aircraft: { takeoff: {}, landing: {} },
    } as unknown as NavLogAltitude,
    problem: null,
    legs: [],
    checks: [],
    loading: null,
    loaded: null,
    totals: null,
    assessment: null,
    ...over,
  }) as Inputs;

// The runway finding's fields are the engine's (gonogo_runway_findings,
// held to fixtures/rules/gonogo.json): the web passes its checks on.
describe("verdictInput's runways", () => {
  it("names each field once under each flag it has, in the route's order", () => {
    const checks = [
      check("KAAA", { headwindKt: -3, distances: [distance({ over: true })] }),
      check("KBBB", { crosswindOver: true, distances: [distance({ beyond: true }), distance({ close: true })] }),
      check("KCCC", { unchecked: "its elevation is not known" }),
      check("KAAA", { distances: [distance({ close: true, unknown: true })] }),
    ];
    expect(verdictInput(inputs({ checks })).runways).toEqual({
      pending: false,
      worked: true,
      short: ["KAAA"],
      crosswind: ["KBBB"],
      beyond: ["KBBB"],
      tailwind: ["KAAA"],
      close: ["KBBB", "KAAA"],
      unchecked: ["KCCC", "KAAA"],
    });
  });

  it("is pending while the nav log is awaited, and not held unworked", () => {
    const runways = verdictInput(inputs({ nav: null })).runways;
    expect([runways.pending, runways.worked]).toEqual([true, true]);
  });
});
