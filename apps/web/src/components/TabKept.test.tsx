// @vitest-environment jsdom
/**
 * A tab kept hidden does no work: its clock stops and its store reads
 * draw nothing until it is back, when both read what is now.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { create } from "zustand";
import TabKept from "./TabKept";
import { useShownStore } from "../lib/shown";
import { useClock } from "../lib/useMinuteClock";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a tab kept under the others", () => {
  test("stops its clock while hidden and reads the time again on its return", () => {
    function Ticking() {
      return <span data-testid="now">{useClock(1000)}</span>;
    }
    const shownNow = () => Number(screen.getByTestId("now").textContent);
    const { rerender } = render(
      <TabKept away={false}>
        <Ticking />
      </TabKept>,
    );
    act(() => vi.advanceTimersByTime(3000));
    expect(shownNow()).toBe(Date.now());
    rerender(
      <TabKept away>
        <Ticking />
      </TabKept>,
    );
    const left = shownNow();
    act(() => vi.advanceTimersByTime(10_000));
    expect(shownNow()).toBe(left);
    rerender(
      <TabKept away={false}>
        <Ticking />
      </TabKept>,
    );
    // At once, not a whole beat later.
    act(() => vi.advanceTimersByTime(1));
    expect(shownNow()).toBeGreaterThanOrEqual(left + 10_000);
  });

  test("draws nothing at a store's change while hidden, and what it is now on its return", () => {
    const useFix = create<{ fix: number }>(() => ({ fix: 0 }));
    let renders = 0;
    function Fix() {
      const fix = useShownStore(useFix, (s) => s.fix);
      renders += 1;
      return <span data-testid="fix">{fix}</span>;
    }
    const { rerender } = render(
      <TabKept away>
        <Fix />
      </TabKept>,
    );
    const hidden = renders;
    act(() => {
      for (let n = 1; n <= 5; n++) useFix.setState({ fix: n });
    });
    expect(renders).toBe(hidden);
    rerender(
      <TabKept away={false}>
        <Fix />
      </TabKept>,
    );
    expect(screen.getByTestId("fix").textContent).toBe("5");
    act(() => useFix.setState({ fix: 6 }));
    expect(screen.getByTestId("fix").textContent).toBe("6");
  });
});
