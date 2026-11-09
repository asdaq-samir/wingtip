import { describe, expect, test } from "vitest";
import fixture from "../../lib/fixtures/atcCalls.json";
import { atcCall, readbackOf } from "./atcEngine";
import { heardInto, KEPT_CARDS, READBACK_WINDOW_MS, shownCard, type AtcCard } from "./atcCards";

// The engine's answers over the shared fixture, as its own tests ask
// them (engine/facade/tests/atc.rs): the page hears as the phone does.
describe("a transmission heard", () => {
  test.each(fixture.calls)("$name", ({ heard, who, items }) => {
    expect(atcCall(heard, fixture.tail, null)).toEqual({ who, items });
  });

  test.each(fixture.prior)("$name", ({ prior, ago_s, heard, who }) => {
    expect(atcCall(heard, fixture.tail, { text: prior, agoS: ago_s }).who).toBe(who);
  });

  test.each(fixture.readbacks)("readback: $name", ({ cleared, said, items, words }) => {
    expect(readbackOf(cleared, said, fixture.tail)).toEqual({ items, words });
  });
});

const call = fixture.calls[0]!.heard;
const readback = fixture.readbacks[1]!;

describe("the cards", () => {
  test("a call to us makes a card with its items; someone else's makes none", () => {
    let cards: AtcCard[] = heardInto([], { id: 1, text: "Cessna six three alpha bravo descend and maintain four thousand", at: 0 }, fixture.tail);
    expect(cards).toEqual([]);
    cards = heardInto(cards, { id: 2, text: call, at: 1000 }, fixture.tail);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.items.map(i => i.kind)).toEqual(["heading", "altitude", "altimeter"]);
    expect(shownCard(cards)?.id).toBe(2);
  });

  test("our own transmission after it is its readback, checked", () => {
    let cards = heardInto([], { id: 1, text: readback.cleared, at: 0 }, fixture.tail);
    cards = heardInto(cards, { id: 2, text: `${readback.said}, Cessna three alpha bravo`, at: 5000 }, fixture.tail);
    // With the call sign now said, only the altitude is wrong.
    expect(cards[0]!.readback?.check.items.map(i => i.item)).toEqual(["altitude"]);
  });

  test("Read Back tapped: the next transmission is it, whoever the words say said it", () => {
    let cards = heardInto([], { id: 1, text: readback.cleared, at: 0 }, fixture.tail);
    cards = [{ ...cards[0]!, awaiting: true }];
    cards = heardInto(cards, { id: 2, text: readback.said, at: 3000 }, fixture.tail);
    expect(cards[0]!.awaiting).toBe(false);
    expect(cards[0]!.readback?.check).toEqual({ items: readback.items, words: readback.words });
  });

  test("past the window a transmission is no readback", () => {
    let cards = heardInto([], { id: 1, text: readback.cleared, at: 0 }, fixture.tail);
    cards = heardInto(cards, { id: 2, text: `${readback.said}, Cessna three alpha bravo`, at: READBACK_WINDOW_MS + 1 }, fixture.tail);
    expect(cards[0]!.readback).toBeNull();
  });

  test("with no airplane nothing is ours", () => {
    expect(heardInto([], { id: 1, text: call, at: 0 }, null)).toEqual([]);
  });

  test("the newest few are kept, a card put away is not shown", () => {
    let cards: AtcCard[] = [];
    for (let id = 1; id <= KEPT_CARDS + 2; id++) cards = heardInto(cards, { id, text: call, at: id * 100_000 }, fixture.tail);
    expect(cards).toHaveLength(KEPT_CARDS);
    expect(cards[0]!.id).toBe(KEPT_CARDS + 2);
    expect(shownCard([{ ...cards[0]!, dismissed: true }, ...cards.slice(1)])).toBeNull();
  });
});
