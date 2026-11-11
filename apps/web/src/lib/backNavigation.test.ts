// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { closeTopmost, useBackCloses } from "./backNavigation";
import { holdOpenCard, useOpenCards } from "./openCards";

/** Android's back as Escape: the topmost thing open closed, else the
 *  panel lowered, else nothing (and the app put away). */
describe("closeTopmost", () => {
  const listeners: (() => void)[] = [];
  const on = (target: EventTarget, handler: (event: KeyboardEvent) => void) => {
    const listener = (event: Event) => handler(event as KeyboardEvent);
    target.addEventListener("keydown", listener);
    listeners.push(() => target.removeEventListener("keydown", listener));
  };
  afterEach(() => {
    listeners.splice(0).forEach((off) => off());
    document.body.innerHTML = "";
  });

  it("closes what takes Escape, a card or a menu, and goes no further", () => {
    document.body.innerHTML = '<div data-slot="map-panel" data-panel="full"></div>';
    let lowered = false;
    on(document.querySelector("[data-slot=map-panel]")!, () => {
      lowered = true;
    });
    on(document, (event) => {
      if (event.key === "Escape") event.preventDefault();
    });
    expect(closeTopmost()).toBe(true);
    expect(lowered).toBe(false);
  });

  it("closes the card on top, an airport's over Nearest's, before the panel", () => {
    document.body.innerHTML = '<div data-slot="map-panel" data-panel="full"></div>';
    const closed: string[] = [];
    let lowered = false;
    on(document.querySelector("[data-slot=map-panel]")!, () => {
      lowered = true;
    });
    const nearest = holdOpenCard({ close: () => closed.push("nearest") });
    const airport = holdOpenCard({ close: () => closed.push("airport") });
    expect(closeTopmost()).toBe(true);
    airport();
    expect(closeTopmost()).toBe(true);
    nearest();
    expect(closed).toEqual(["airport", "nearest"]);
    expect(lowered).toBe(false);
  });

  it("closes a list in full by its Back, as a card, though the tab bar's Back counts cards alone", () => {
    document.body.innerHTML = '<div data-slot="map-panel" data-panel="full"></div>';
    const closed: string[] = [];
    const list = holdOpenCard({ close: () => closed.push("favorites"), inBar: false });
    expect(useOpenCards.getState().count).toBe(0);
    expect(closeTopmost()).toBe(true);
    list();
    expect(closed).toEqual(["favorites"]);
  });

  it("lowers the panel when nothing else is open", () => {
    document.body.innerHTML = '<div data-slot="map-panel" data-panel="full"></div>';
    let lowered = 0;
    on(document.querySelector("[data-slot=map-panel]")!, (event) => {
      if (event.key === "Escape") lowered += 1;
    });
    expect(closeTopmost()).toBe(true);
    expect(lowered).toBe(1);
  });

  it("has nothing to close with the panel down", () => {
    document.body.innerHTML = '<div data-slot="map-panel" data-panel="peek"></div>';
    expect(closeTopmost()).toBe(false);
  });
});

/** Android's Back on the web: the browser's CloseWatcher, held while
 *  something is open, closing the top card. */
describe("useBackCloses", () => {
  const watchers: { onclose: (() => void) | null; destroyed: boolean }[] = [];
  class FakeWatcher {
    onclose: (() => void) | null = null;
    destroyed = false;
    constructor() {
      watchers.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const live = () => watchers.filter((watcher) => !watcher.destroyed);
  const touch = (coarse: boolean) =>
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: coarse, media: query }) as MediaQueryList);
  afterEach(() => {
    watchers.splice(0);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("holds a watcher while a card is open, and Back closes the top one", () => {
    vi.stubGlobal("CloseWatcher", FakeWatcher);
    touch(true);
    const closed: string[] = [];
    const first = holdOpenCard({ close: () => closed.push("KMSN") });
    const second = holdOpenCard({ close: () => closed.push("KDLH") });
    renderHook(() => useBackCloses(false));
    expect(live()).toHaveLength(1);
    live()[0].onclose?.();
    expect(closed).toEqual(["KDLH"]);
    // Made again for the next Back while there is more to close.
    expect(watchers).toHaveLength(2);
    first();
    second();
  });

  it("holds none with nothing open, so Back leaves as the browser's would", () => {
    vi.stubGlobal("CloseWatcher", FakeWatcher);
    touch(true);
    renderHook(() => useBackCloses(false));
    expect(useOpenCards.getState().total).toBe(0);
    expect(live()).toHaveLength(0);
  });

  it("drops its watcher once nothing is open", () => {
    vi.stubGlobal("CloseWatcher", FakeWatcher);
    touch(true);
    const { rerender } = renderHook(({ raised }) => useBackCloses(raised), { initialProps: { raised: true } });
    expect(live()).toHaveLength(1);
    rerender({ raised: false });
    expect(live()).toHaveLength(0);
  });

  it("leaves a desktop's Escape and a browser without CloseWatcher alone", () => {
    touch(true);
    renderHook(() => useBackCloses(true));
    expect(watchers).toHaveLength(0);
    vi.stubGlobal("CloseWatcher", FakeWatcher);
    touch(false);
    renderHook(() => useBackCloses(true));
    expect(watchers).toHaveLength(0);
  });
});
