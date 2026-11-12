// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import type { SetURLSearchParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useAddressCards, usePanelView } from "./usePanelView";

/** The two hooks over an address of their own, as the planner has them. */
function setUp(start: string, hasRoute: boolean) {
  return renderHook(
    ({ route }) => {
      const [params, setParams] = useState(() => new URLSearchParams(start));
      const set: SetURLSearchParams = (next) =>
        setParams((prev) => new URLSearchParams((typeof next === "function" ? next(prev) : next) as URLSearchParams));
      const cards = useAddressCards(params, set, vi.fn());
      return { params, ...usePanelView({ cards, route, hasRoute: route !== "", searchParams: params, setSearchParams: set }) };
    },
    { initialProps: { route: hasRoute ? "KMSN||KOSH" : "" } },
  );
}

describe("the place under the one search", () => {
  it("is the plan with a route and the search's own page with none", () => {
    expect(setUp("dep=KMSN&dest=KOSH", true).result.current.view).toBe("plan");
    expect(setUp("", false).result.current.view).toBe("search");
  });

  it("is the search for its lists in full and the traffic for an airplane, by the address", () => {
    expect(setUp("list=favorites", true).result.current.view).toBe("search");
    expect(setUp("saved=1", true).result.current.view).toBe("search");
    expect(setUp("near=1", true).result.current.view).toBe("search");
    expect(setUp("aircraft=1", true).result.current.view).toBe("traffic");
    expect(setUp("flight=a0b7d8", false).result.current.view).toBe("traffic");
  });

  it("goes back to the plan when a new route comes, wherever the pilot was", () => {
    const hook = setUp("", false);
    act(() => hook.result.current.pickView("search"));
    hook.rerender({ route: "KMSN||KOSH" });
    expect(hook.result.current.view).toBe("plan");
  });

  it("goes back to the plan when the same route is asked for again (Fly Here, Plan Again)", () => {
    const hook = setUp("dep=KMSN&dest=KOSH", true);
    hook.rerender({ route: "KMSN||KOSH|1" });
    act(() => hook.result.current.pickView("search"));
    expect(hook.result.current.view).toBe("search");
    hook.rerender({ route: "KMSN||KOSH|2" });
    expect(hook.result.current.view).toBe("plan");
  });

  it("opens the traffic in the address, and keeps a card for the place it was open over", () => {
    const hook = setUp("dep=KMSN&dest=KOSH&place=KOSH", true);
    act(() => hook.result.current.pickView("traffic"));
    expect(hook.result.current.params.get("aircraft")).toBe("1");
    expect(hook.result.current.params.get("place")).toBeNull();
    act(() => hook.result.current.pickView("plan"));
    expect(hook.result.current.params.get("place")).toBe("KOSH");
  });

  it("turns back to the traffic on the first page where that is what was left there", () => {
    // The sheet audit, 2026-11-12: swiped to FPL and back, the traffic came back as the plain search.
    const hook = setUp("dep=KMSN&dest=KOSH&aircraft=1", true);
    expect(hook.result.current.view).toBe("traffic");
    act(() => hook.result.current.pickPage(1));
    expect(hook.result.current.view).toBe("plan");
    act(() => hook.result.current.pickPage(0));
    expect(hook.result.current.view).toBe("traffic");
    expect(hook.result.current.params.get("aircraft")).toBe("1");
    // And the search where the search was.
    act(() => hook.result.current.pickView("search"));
    act(() => hook.result.current.pickPage(1));
    act(() => hook.result.current.pickPage(0));
    expect(hook.result.current.view).toBe("search");
  });
});
