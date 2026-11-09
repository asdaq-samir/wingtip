import { describe, expect, test } from "vitest";
import type { Briefing } from "../../lib/api/types";
import { callEngine } from "../../lib/engine/engine";
import fixture from "../../lib/fixtures/readyToFly.json";
import { downloadMb, editionDay, readyInput, type ReadyInput, type ReadyParts } from "./readyFacts";

const NOW_MS = 1_794_247_200_000;

function parts(over: Partial<ReadyParts> = {}): ReadyParts {
  return {
    nowMs: NOW_MS,
    dep: "KOSH",
    dest: "KMSN",
    routed: true,
    airplane: null,
    altitudeFt: null,
    chart: null,
    cycles: [],
    briefing: null,
    alternate: null,
    notamsAtMs: null,
    device: { batteryPct: null, charging: null, location: null },
    ...over,
  };
}

describe("ready to fly's facts", () => {
  test("no airplane is sent as none, never a 172", () => {
    expect(readyInput(parts()).plan).toEqual({ route: true, airplane: null, altitude_ft: null });
  });

  test("a chart cycle in the planner's MM-DD-YYYY is read as a day", () => {
    expect(editionDay("10-29-2026")).toBe("2026-10-29");
    expect(editionDay("2026-10-29")).toBe("2026-10-29");
    expect(editionDay("soon")).toBeNull();
  });

  test("a thousand tiles are about fifteen megabytes, 2.7 times that dense", () => {
    expect(downloadMb(1000, false)).toBeCloseTo(15);
    expect(downloadMb(1000, true)).toBeCloseTo(40.5);
  });

  test("each field's METAR time and TAF come from the briefing", () => {
    const briefing = {
      metars: { KOSH: { observed_at: "2026-11-09T17:30:00Z" } },
      forecast: { stations: [{ icaoId: "KMSN" }] },
    } as unknown as Briefing;
    const input = readyInput(parts({ briefing: { data: briefing, atMs: NOW_MS - 600_000 } }));
    expect(input.briefing).toEqual({ fetched_at: 1_794_246_600 });
    expect(input.fields).toEqual([
      { ident: "KOSH", role: "departure", metar_observed: 1_794_245_400, taf: false },
      { ident: "KMSN", role: "destination", metar_observed: null, taf: true },
    ]);
  });

  test("the packs' edition is the planner's own data, which the web cannot update", () => {
    const input = readyInput(parts({ cycles: [{ key: "nasr", effective: "2026-10-29" } as ReadyParts["cycles"][number]] }));
    expect(input.packs).toEqual({ edition: "2026-10-29", can_update: false });
  });
});

describe("the engine's answer, as the phones get it", () => {
  test.each(fixture.cases)("$why", (c) => {
    const answer = callEngine("ready_to_fly", c.input as ReadyInput);
    expect(answer.finding).toBe(c.expected.finding);
    expect(answer.actions.map((a) => a.key)).toEqual(c.expected.actions);
    expect(answer.actions.length).toBeLessThanOrEqual(3);
  });
});
