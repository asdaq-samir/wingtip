import { describe, expect, test } from "vitest";
import { landingRunway } from "./landingRunway";

const ils09 = { runway: "09", circling: false, name: "ILS RWY 09" };

describe("the runway landed on with an approach", () => {
  test("the approach's own where none is picked: Land RWY 9 (KDLH's ILS 09)", () => {
    expect(landingRunway(ils09, null, false)).toEqual({ runway: "9", othersAllowed: false });
  });

  test("a wind's pick gives way to the approach's runway", () => {
    expect(landingRunway(ils09, "27", false).runway).toBe("9");
  });

  test("the pilot's circle to another stands only where the plate publishes circling", () => {
    expect(landingRunway({ ...ils09, circling: true }, "27", true)).toEqual({ runway: "27", othersAllowed: true });
    expect(landingRunway(ils09, "27", true).runway).toBe("9");
    expect(landingRunway({ ...ils09, circling: undefined }, "27", true).runway).toBe("9");
  });

  test("no approach, or one circling only, keeps the pick", () => {
    expect(landingRunway(null, "27", false)).toEqual({ runway: "27", othersAllowed: true });
    expect(landingRunway({ runway: null, circling: true, name: "RNAV (GPS)-B" }, null, false)).toEqual({
      runway: null,
      othersAllowed: true,
    });
  });
});
