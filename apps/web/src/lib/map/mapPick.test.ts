// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { pickOnMap, putAwayPicks, useMapPickOwner, useMapRing, useRingWhileUp } from "./mapPick";

describe("one pick on the map at a time", () => {
  it("puts every other kind up away, keeps the kinds picked, and a tap on the chart puts all away", () => {
    const place = vi.fn(),
      card = vi.fn(),
      point = vi.fn();
    const hooks = [
      renderHook(() => useMapPickOwner("place", true, place)),
      renderHook(() => useMapPickOwner("card", true, card)),
      renderHook(() => useMapPickOwner("point", true, point)),
    ];
    // A checkpoint's card and its ring picked together: the field's card put away.
    pickOnMap(["card", "point"]);
    expect([place.mock.calls.length, card.mock.calls.length, point.mock.calls.length]).toEqual([1, 0, 0]);
    // The card's ✕ takes its ring with it.
    putAwayPicks(["point"]);
    expect(point).toHaveBeenCalledTimes(1);
    // A tap on the chart: every one.
    pickOnMap(null);
    expect([place.mock.calls.length, card.mock.calls.length, point.mock.calls.length]).toEqual([2, 1, 2]);
    for (const h of hooks) h.unmount();
  });

  it("asks nothing of a kind not up", () => {
    const away = vi.fn();
    const hook = renderHook(() => useMapPickOwner("navaid", false, away));
    pickOnMap("place");
    expect(away).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("rings a card's point while it is drawn, and leaves the next card's ring when it goes", () => {
    const first = renderHook(() => useRingWhileUp({ lat: 42, lon: -88 }));
    expect(useMapRing.getState().at).toEqual({ lat: 42, lon: -88 });
    // The next card's ring set before the first card has gone.
    const second = renderHook(() => useRingWhileUp({ lat: 43, lon: -89 }));
    first.unmount();
    expect(useMapRing.getState().at).toEqual({ lat: 43, lon: -89 });
    second.unmount();
    expect(useMapRing.getState().at).toBeNull();
  });
});
