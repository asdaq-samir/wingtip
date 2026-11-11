import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/atcCalls.json";
import { atcCall, type AtcItem } from "./atcEngine";
import { actionOf, callLine, itemWords } from "./atcWords";

const items = (name: string): AtcItem[] => {
  const c = fixture.calls.find((x) => x.name === name)!;
  return atcCall(c.heard, fixture.tail, null).items;
};

describe("a call's items in words", () => {
  test("a descent and a vector, with the altimeter", () => {
    expect(callLine(items("a descent and a vector, with the altimeter"), "")).toBe("Left heading 270 · Descend 3,000 ft · Altimeter 29.92");
  });

  test("a hand-off and a code", () => {
    expect(callLine(items("a hand-off and a code"), "")).toBe("Squawk 4512 · Approach 125.35");
  });

  test("a hold not charted, its time in UTC", () => {
    expect(callLine(items("a hold not charted (AIM 5-3-8's items)"), "")).toBe("Hold NE of GOPHER, 045 radial, left turns, EFC 1430Z");
  });

  test("approaches cleared and expected", () => {
    expect(callLine(items("an approach cleared, its runway's side"), "")).toBe("Maintain 2,500 ft · Cleared ILS 27L approach");
    expect(callLine(items("an approach to expect, a lettered RNAV"), "")).toBe("Expect RNAV (GPS) Z 31 approach");
  });

  test("a runway, Class B, and an altitude's limit", () => {
    expect(callLine(items("a runway to land on"), "")).toBe("Runway 27, cleared to land");
    expect(callLine(items("into Class B (14 CFR 91.131(a)(1))"), "")).toBe("Cleared into Class B · Maintain at or above 4,500 ft");
  });

  test("a flight level as ATC says it (AIM 4-2-9)", () => {
    expect(itemWords({ kind: "altitude", ft: 21000, verb: "climb", limit: null })).toBe("Climb FL210");
  });

  test("nothing read, the words as heard", () => {
    expect(callLine([], "Cessna three alpha bravo, wilco")).toBe("Cessna three alpha bravo, wilco");
  });

  test("what a tap can do: only the altitude, a direct, the frequency, the code and a route", () => {
    expect(items("a descent and a vector, with the altimeter").map(actionOf)).toEqual([null, "fly", null]);
    expect(items("a direct and a climb").map(actionOf)).toEqual(["direct", "fly"]);
    expect(items("a hand-off and a code").map(actionOf)).toEqual(["squawk", "frequency"]);
  });
});
