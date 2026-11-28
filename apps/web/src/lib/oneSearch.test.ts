/**
 * The first flight's destination ask waits for the field: until the pilot
 * uses it, a tap on Nearest opens the airport's card rather than picking
 * it, where the nearest field, picked as the destination, brought a
 * "Destination" picker back (the owner's iPhone, 2026-11-23).
 */
import { describe, expect, test, vi } from "vitest";
import { pickInUse, type SearchPick } from "./oneSearch";

const ask = (waiting?: boolean): SearchPick => ({ label: "Destination", fixes: false, onPick: vi.fn(), waiting });

describe("pickInUse", () => {
  test("a waiting ask takes no tap while the field is at rest", () => {
    expect(pickInUse(ask(true), false)).toBeNull();
  });

  test("a waiting ask picks once the field is used", () => {
    const pick = ask(true);
    expect(pickInUse(pick, true)).toBe(pick);
  });

  test("an end's or a stop's ask picks at once", () => {
    const pick = ask();
    expect(pickInUse(pick, false)).toBe(pick);
  });

  test("no ask, no pick", () => {
    expect(pickInUse(null, true)).toBeNull();
  });
});
