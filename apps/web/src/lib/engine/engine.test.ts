import { describe, expect, test } from "vitest";
import { callEngine, engineLoaded, engineReady } from "./engine";
import { WEB_RULES } from "./webRules";

describe("the engine, by name", () => {
  test("loaded before any test, its answers the planner's JSON", async () => {
    await engineReady;
    expect(engineLoaded()).toBe(true);
    expect(callEngine("holding_leg_minutes", { altitude_ft: 16_000 })).toBe(1.5);
    expect(callEngine("holding", { inbound: 360, heading: 112 })).toMatchObject({ entry: "teardrop", either: "direct" });
  });

  test("a rule it has not, or input it cannot use, throws its words", () => {
    // Neither is let through by the types (the contract's names and
    // inputs), so these are asked past them, as a stale caller would.
    // @ts-expect-error -- no rule is called "nope".
    expect(() => callEngine("nope", {})).toThrow("The engine rule nope is not built into the web's WebAssembly");
    // @ts-expect-error -- holding's "heading" is required.
    expect(() => callEngine("holding", { inbound: 360 })).toThrow('holding: "heading" is missing');
  });

  test("a rule the web does not ask is not built in, and says so by name", () => {
    // receiver_read is the phones' (an ADS-B receiver's bytes): in the
    // contract, left out of the web's module (scripts/build/web_rules.py).
    expect(WEB_RULES).not.toContain("receiver_read");
    // @ts-expect-error -- not a rule the web's module answers.
    expect(() => callEngine("receiver_read", {})).toThrow("The engine rule receiver_read is not built into the web's WebAssembly");
  });

  test("every rule the web asks is built into its module", () => {
    // Each asked with no input: a rule built in refuses the input with its
    // words, and none may answer that it has no such rule.
    for (const name of WEB_RULES) {
      let words = "";
      try {
        callEngine(name, {} as never);
      } catch (e) {
        words = String(e);
      }
      expect(words, name).not.toContain("has no rule called");
    }
  });

  test("text crosses whole, and many calls leak nothing the memory notices", () => {
    const named = callEngine("lost_comms", { segments: [{ name: "Ö’Hare → “B” 😀", minimum_ft: 3000 }] });
    expect(named.segments[0]!.name).toBe("Ö’Hare → “B” 😀");
    const big = Array.from({ length: 5000 }, (_, i) => ({ t: i * 1000, lat: 42 + i / 3600, lon: -88, alt_ft: 3000 }));
    for (let i = 0; i < 20; i++) callEngine("debrief_airborne", { points: big });
    expect(callEngine("debrief_airborne", { points: big })).toEqual([[0, 4999]]);
  });
});
