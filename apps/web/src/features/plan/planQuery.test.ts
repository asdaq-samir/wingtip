import { describe, expect, test } from "vitest";
import { ApiError } from "../../lib/api/client";
import type { AircraftChoice } from "../../lib/api/types";
import { navlogQuery, type PlanParams } from "./planQuery";

const plan: PlanParams = {
  dep: "C81",
  dest: "KDLH",
  stops: [],
  altitudeFt: "",
  altitudeChoice: "fastest",
  depart: "",
  aircraft: { none: true } as AircraftChoice,
  load: 0,
};
const retry = navlogQuery(plan, true).retry;

describe("the nav log asked again", () => {
  test("on a 5xx, an answer before its first line, three times", () => {
    // The gateway's 502 while the planner dropped its connections (run 45152106014).
    expect(retry(0, new ApiError("The planner did not answer. Try again in a moment.", 502))).toBe(true);
    expect(retry(2, new ApiError("Gateway Timeout", 504))).toBe(true);
    expect(retry(3, new ApiError("Bad Gateway", 502))).toBe(false);
  });

  test("not once its lines have begun, nor for what the request got wrong", () => {
    // The stream's own failure, its last line after a 200 (lib/api/streams).
    expect(retry(0, new ApiError("the nav log ended before it was finished", 200))).toBe(false);
    // A connection dropped part way in: asked again, the route planned again behind the lines drawn.
    expect(retry(0, new TypeError("Failed to fetch"))).toBe(false);
    // No legal altitude, a place not known.
    expect(retry(0, new ApiError("No legal altitude", 422))).toBe(false);
    expect(retry(0, new ApiError("Not Found", 404))).toBe(false);
  });
});
