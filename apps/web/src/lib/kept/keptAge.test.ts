import { describe, expect, test } from "vitest";
import fixture from "../fixtures/keptAge.json";
import { KEPT_KINDS, keptAge, type KeptKind } from "./keptAge";

describe("a kept answer's age, the engine's (keptAge.json, as both phones read it)", () => {
  test.each(fixture.cases)("$why", (c) => {
    const answer = keptAge(c.input.kind as KeptKind, c.input.fetched_at * 1000, c.input.now * 1000);
    expect(answer).toMatchObject(c.expected);
  });

  test("every kind is past its freshness a day on, a caution and never more", () => {
    const now = 1_794_247_200_000;
    for (const kind of KEPT_KINDS) expect(keptAge(kind, now - 40 * 86_400_000, now)?.finding).toBe("caution");
  });

  test("no time, no age", () => {
    expect(keptAge("briefing", null, Date.now())).toBeNull();
    expect(keptAge("briefing", Number.NaN, Date.now())).toBeNull();
  });
});
