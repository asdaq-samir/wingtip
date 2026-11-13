import { describe, expect, test } from "vitest";
import { weatherAgeWords } from "./weatherAge";

describe("the field weather marks' age", () => {
  test("said once half an hour old, nothing while fresh or unknown", () => {
    const now = 10 * 3_600_000;
    expect(weatherAgeWords(now - 10 * 60_000, now)).toBeNull();
    expect(weatherAgeWords(null, now)).toBeNull();
    expect(weatherAgeWords(now - 45 * 60_000, now)).toMatch(/^Field weather 45 ?m(in)? old$/);
  });
});
