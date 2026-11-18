// @vitest-environment jsdom
/** FPL's suggested routes put away as their route changes (useRoutesShown). */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useRoutesShown } from "./useRoutesShown";

afterEach(cleanup);

const shownFor = (key: string | null) => renderHook(({ k }) => useRoutesShown(k), { initialProps: { k: key } });

describe("useRoutesShown", () => {
  test("starts put away and comes out at the ask", () => {
    const { result } = shownFor("KORD-KPWK");
    expect(result.current.routesShown).toBe(false);
    act(() => result.current.setRoutesShown(true));
    expect(result.current.routesShown).toBe(true);
  });

  test("put away for another route, and stays so when it comes back", () => {
    const { result, rerender } = shownFor("KORD-KPWK");
    act(() => result.current.setRoutesShown(true));
    rerender({ k: "KORD-KMKE" });
    expect(result.current.routesShown).toBe(false);
    rerender({ k: "KORD-KPWK" });
    expect(result.current.routesShown).toBe(false);
  });

  test("put away when the ways go, not back out when they return", () => {
    const { result, rerender } = shownFor("KORD-KPWK");
    act(() => result.current.setRoutesShown(true));
    rerender({ k: null });
    expect(result.current.routesShown).toBe(false);
    rerender({ k: "KORD-KPWK" });
    expect(result.current.routesShown).toBe(false);
  });

  test("never out with no ways to suggest", () => {
    const { result } = shownFor(null);
    act(() => result.current.setRoutesShown(true));
    expect(result.current.routesShown).toBe(false);
  });
});
