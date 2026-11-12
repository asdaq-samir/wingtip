import { describe, expect, it } from "vitest";
import { TokenFieldValue } from "react-aria-components";
import { caretBefore, endedWords, removedPoint, routeValue, samePoints, takeTyped, tokensOf, typedOf, type RouteValue } from "./routeTokens";

/** A value with text typed in at a segment's place, the caret after it. */
function typing(value: RouteValue, index: number, text: string): RouteValue {
  return value.replaceRange({ index, offset: 0 }, { index, offset: 0 }, text);
}

describe("the route's points as TokenField tokens", () => {
  it("says each point as a token, its place in the route its value", () => {
    const value = routeValue(["KDLH", "KMSP", "KMDW"]);
    expect(value.segments).toEqual([
      { type: "token", text: "KDLH", value: 0 },
      { type: "token", text: "KMSP", value: 1 },
      { type: "token", text: "KMDW", value: 2 },
    ]);
    expect(tokensOf(value)).toEqual(["KDLH", "KMSP", "KMDW"]);
    // The caret after the last point.
    expect(value.caretPosition).toEqual({ index: 3, offset: 0 });
  });

  it("keeps what is typed before the point it was typed before, the caret after it", () => {
    const value = routeValue(["KDLH", "KMDW"], "KM", 1);
    expect(value.segments.map((s) => s.type)).toEqual(["token", "text", "token"]);
    expect(value.caretPosition).toEqual({ index: 1, offset: 2 });
    expect(typedOf(value)).toEqual({ text: "KM", at: 1 });
  });

  it("follows the value it came from in the field's undo history", () => {
    const before = routeValue(["KDLH", "KMSP", "KMDW"]);
    const after = routeValue(["KDLH", "KMDW"], "", null, before);
    expect(tokensOf(after.undo())).toEqual(["KDLH", "KMSP", "KMDW"]);
  });
});

describe("what is typed, and where", () => {
  it("is after the last point (null) when typed there", () => {
    const value = typing(routeValue(["KDLH", "KMDW"]), 2, "KMS");
    expect(typedOf(value)).toEqual({ text: "KMS", at: null });
  });

  it("is where the caret is when nothing is typed", () => {
    const value = routeValue(["KDLH", "KMDW"]).withCaretPosition({ index: 1, offset: 0 });
    expect(typedOf(value)).toEqual({ text: "", at: 1 });
    expect(typedOf(routeValue(["KDLH", "KMDW"]))).toEqual({ text: "", at: null });
  });

  it("puts the caret before a point, or after the last", () => {
    const value = routeValue(["KDLH", "KMSP", "KMDW"]);
    expect(caretBefore(value, 1)).toEqual({ index: 1, offset: 0 });
    expect(caretBefore(value, null)).toEqual({ index: 3, offset: 0 });
  });
});

describe("words ended by a space or a comma", () => {
  it("go in where they were typed, the unfinished word kept", () => {
    const value = typing(routeValue(["KDLH", "KMDW"]), 1, "KMSP KOSH,KM");
    const ended = endedWords(value)!;
    expect(ended.words).toEqual(["KMSP", "KOSH"]);
    expect(ended.at).toBe(1);
    expect(typedOf(ended.rest)).toEqual({ text: "KM", at: 1 });
    expect(tokensOf(ended.rest)).toEqual(["KDLH", "KMDW"]);
  });

  it("are none until a word is ended", () => {
    expect(endedWords(typing(routeValue(["KDLH"]), 1, "KMS"))).toBeNull();
  });

  it("a space alone ends no word", () => {
    const ended = endedWords(typing(routeValue(["KDLH"]), 1, " "))!;
    expect(ended.words).toEqual([]);
    expect(typedOf(ended.rest).text).toBe("");
  });
});

// Integration's browser tests (stops.spec, 2026-11-12): Return and the
// field's blur after it each put what was typed in, KMSP the destination
// and a stop, KMSN both ends of a cleared route.
describe("what is typed, taken to go in", () => {
  it("is taken once: the value left has nothing typed to take again", () => {
    const value = routeValue(["KRYV", "KMSN", "KDLH"], "KMSP");
    const taken = takeTyped(value)!;
    expect(taken.words).toEqual(["KMSP"]);
    expect(taken.at).toBeNull();
    expect(tokensOf(taken.rest)).toEqual(["KRYV", "KMSN", "KDLH"]);
    expect(takeTyped(taken.rest)).toBeNull();
  });

  it("on a cleared route, the one word typed, once", () => {
    const taken = takeTyped(routeValue([], "KMSN"))!;
    expect(taken.words).toEqual(["KMSN"]);
    expect(takeTyped(taken.rest)).toBeNull();
  });

  it("is nothing where only spaces are typed", () => {
    expect(takeTyped(routeValue(["KDLH"], "  "))).toBeNull();
  });
});

describe("the points the field took out", () => {
  it("finds the one point gone, the same airport twice told apart by place", () => {
    expect(removedPoint(["KDLH", "KMSP", "KMDW"], ["KDLH", "KMDW"])).toBe(1);
    expect(removedPoint(["KDLH", "KMSP", "KMDW"], ["KDLH", "KMSP"])).toBe(2);
    expect(removedPoint(["KDLH", "KDLH", "KMDW"], ["KDLH", "KMDW"])).toBe(1);
  });

  it("is none where the lists differ another way", () => {
    expect(removedPoint(["KDLH", "KMSP", "KMDW"], ["KMSP", "KDLH"])).toBeNull();
    expect(removedPoint(["KDLH", "KMSP", "KMDW"], ["KDLH"])).toBeNull();
    expect(removedPoint(["KDLH", "KMDW"], ["KDLH", "KMSP", "KMDW"])).toBeNull();
  });

  it("compares two lists of points in order", () => {
    expect(samePoints(["KDLH", "KMDW"], ["KDLH", "KMDW"])).toBe(true);
    expect(samePoints(["KDLH", "KMDW"], ["KMDW", "KDLH"])).toBe(false);
  });

  it("reads a value the field built itself", () => {
    const value = new TokenFieldValue<number>([{ type: "token", text: "KDLH", value: 0 }]);
    expect(tokensOf(value)).toEqual(["KDLH"]);
  });
});
