import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/tafValidity.json";
import { tafLine, tafValidity } from "./tafValidity";

describe("a TAF's valid period, the engine's (tafValidity.json, FAA-H-8083-28B 27.4.1)", () => {
  test.each(fixture.cases)("$why", (c) => {
    expect(tafValidity(fixture.taf, c.now * 1000)).toMatchObject(c.expected);
  });

  test("its line says when it was issued and to when it is valid, or that it has expired", () => {
    const [notYet, inForce, , expired] = fixture.cases.map((c) => tafValidity(fixture.taf, c.now * 1000)!);
    expect(tafLine(notYet!)).toEqual({ line: "TAF issued 11 1130Z, valid from 11 1200Z", caution: false });
    expect(tafLine(inForce!)).toEqual({ line: "TAF issued 11 1130Z, valid to 12 1200Z", caution: false });
    expect(tafLine(expired!)).toEqual({ line: "TAF expired 12 1200Z: no forecast in force", caution: true });
  });

  test("no TAF, or words that are not one, no line", () => {
    expect(tafValidity(null, Date.now())).toBeNull();
    expect(tafValidity("NIL", Date.now())).toBeNull();
  });
});
