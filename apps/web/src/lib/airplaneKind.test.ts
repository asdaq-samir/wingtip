import { describe, expect, it } from "vitest";
import { flyingOf, judgedWords, kindWords } from "./airplaneKind";

describe("the airplane passenger currency was judged for (14 CFR 61.57(a)(1)(ii))", () => {
  it("is said in the class's words with its gear, an unsaid gear as the tailwheel it is judged as", () => {
    expect(judgedWords({ passengerClass: "airplane/single-engine land", passengerTailwheel: false })).toBe("single-engine land, tricycle");
    expect(judgedWords({ passengerClass: "airplane/multiengine sea", passengerTailwheel: true })).toBe("multiengine sea, tailwheel");
    expect(judgedWords({ passengerClass: "airplane/single-engine land", passengerTailwheel: null })).toBe(
      "single-engine land, gear not said, judged as a tailwheel",
    );
    expect(judgedWords({ passengerClass: null, passengerTailwheel: null })).toBeNull();
  });
});

describe("the airplane to be flown, from its profile", () => {
  it("is asked for only where its profile says both its category and class", () => {
    expect(flyingOf({ category: "Airplane", aircraftClass: "Single-engine sea", tailwheel: null })).toEqual({
      category: "Airplane",
      aircraftClass: "Single-engine sea",
      tailwheel: null,
    });
    expect(flyingOf({ category: "Airplane", aircraftClass: null, tailwheel: false })).toBeNull();
    expect(flyingOf(null)).toBeNull();
  });

  it("is said in words for the entry it fills in", () => {
    expect(kindWords({ category: "Airplane", aircraftClass: "Multiengine land", tailwheel: false })).toBe("Multiengine land, tricycle");
    expect(kindWords({ category: null, aircraftClass: null, tailwheel: true })).toBe("tailwheel");
  });
});
