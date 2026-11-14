import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/copilot.json";
import type { CopilotAround } from "../../lib/api/types";
import type { CopilotFlight } from "../../lib/copilot/flight";
import { NO_MINIMUMS } from "../../lib/minimums";
import { copilotInput, nightCurrent, rememberCategories, restOfRoute, watch, type CopilotInput } from "./copilotInput";

type Metar = CopilotInput["fields"][number]["metar"];
type Case = { name: string; with?: Record<string, unknown>; metars?: Record<string, Metar>; expect: Record<string, unknown> | null };

/** A case made whole, as the engine's tests make it (tests/common). */
function inputOf(c: Case): CopilotInput {
  const base = structuredClone(fixture.base) as unknown as CopilotInput;
  const input = { ...base, ...(c.with ?? {}) } as CopilotInput;
  input.fields = input.fields.map((f) => ({ ...f, metar: c.metars?.[f.ident] ?? f.metar }));
  return input;
}

describe("the copilot on the KUGN to KOSH dry run (copilot.json)", () => {
  test.each(fixture.cases as unknown as Case[])("$name", (c) => {
    const answer = watch(inputOf(c));
    expect(answer).not.toBeNull();
    if (!c.expect) {
      expect(answer!.messages).toEqual([]);
      return;
    }
    const first = answer!.messages[0]!;
    expect(first.kind).toBe(c.expect.kind);
    expect(first.level).toBe(c.expect.level);
    if (c.expect.alternative) expect(first.alternative?.ident).toBe(c.expect.alternative);
    if (c.expect.title_has) expect(first.title).toContain(c.expect.title_has);
  });
});

describe("a destination NASR lists as closed (decision 0043)", () => {
  test("is the copilot's \"closed\" warning, the banner's as any other kind, never offered as the alternative", () => {
    const input = inputOf({ name: "closed", expect: null });
    input.fields = input.fields.map((f) => (f.ident === "KOSH" ? { ...f, status: "CI", runways: [] } : f));
    const first = watch(input)!.messages[0]!;
    expect(first).toMatchObject({ kind: "closed", level: "warning" });
    expect(first.alternative?.ident).not.toBe("KOSH");
  });
});

const flight: CopilotFlight = {
  dest: "KOSH",
  alternate: null,
  rules: "VFR",
  line: [
    [42.4222, -87.8679],
    [43.9844, -88.557],
  ],
  plannedGsKt: 110,
  tasKt: 110,
  burnGph: 9,
  fuelGal: 20,
  passengers: false,
};
const around = {
  fields: fixture.base.fields.map(({ planned_category: _, ...f }) => f),
  areas: [],
  itws: [],
  unavailable: [],
  at: 0,
} as unknown as CopilotAround;
const fix = { lat: 43.6, lon: -88.4, accuracyM: 5, headingDeg: 340, speedKt: 105, altitudeFt: 3500, at: 1794243600_000 };

describe("the engine's question from the app's state", () => {
  test("the fuel burnt since the flight started comes off what it started with", () => {
    const input = copilotInput({
      fix,
      flight,
      around,
      ahead: [],
      minimums: NO_MINIMUMS,
      nightCurrent: true,
      startedAtMs: fix.at - 3_600_000,
      firstSeen: {},
    });
    expect(input!.fuel_gal).toBe(11);
    // The miles to go are along the line, from route_position.
    expect(input!.remaining_nm).toBeGreaterThan(20);
    expect(input!.remaining_nm).toBeLessThan(30);
  });

  test("nothing is asked without a fix, a flight or the planner's answer", () => {
    expect(
      copilotInput({ fix: null, flight, around, ahead: [], minimums: NO_MINIMUMS, nightCurrent: null, startedAtMs: null, firstSeen: {} }),
    ).toBeNull();
    expect(
      copilotInput({ fix, flight: null, around, ahead: [], minimums: NO_MINIMUMS, nightCurrent: null, startedAtMs: null, firstSeen: {} }),
    ).toBeNull();
  });

  test("a field's first category is kept, so a worse one is a change", () => {
    const seen = rememberCategories({}, around);
    expect(seen.KOSH).toBe("VFR");
    expect(rememberCategories(seen, around)).toBe(seen);
  });

  test("the rest of the route starts where the airplane is", () => {
    expect(restOfRoute(fix, flight.line, 0)).toBe("43.6,-88.4;43.985,-88.555");
  });

  test("night passenger currency by the logbook's date (61.57(b))", () => {
    const at = Date.UTC(2026, 10, 9, 17) / 1000;
    expect(nightCurrent(undefined, at)).toBeNull();
    expect(nightCurrent({ nightPassengersUntil: "2026-11-09" } as never, at)).toBe(true);
    expect(nightCurrent({ nightPassengersUntil: "2026-11-08" } as never, at)).toBe(false);
    expect(nightCurrent({ nightPassengersUntil: null } as never, at)).toBe(false);
  });
});
