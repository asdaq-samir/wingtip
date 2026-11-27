import { describe, expect, test } from "vitest";
import { weatherAgeWords } from "./weatherAge";

describe("the field weather marks' age", () => {
  // A METAR counts for the routine report's hour (the engine's
  // weather_in_force, AIM 7-1-28): said once past it, nothing before.
  test("said once a METAR's hour has passed, nothing while in force or unknown", () => {
    const now = 10 * 3_600_000;
    expect(weatherAgeWords(now - 10 * 60_000, now)).toBeNull();
    expect(weatherAgeWords(now - 59 * 60_000, now)).toBeNull();
    expect(weatherAgeWords(null, now)).toBeNull();
    expect(weatherAgeWords(now - 65 * 60_000, now)).toMatch(/^Field weather 1 ?h ?5 ?m(in)? old$/);
  });
});
