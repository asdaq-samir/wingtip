// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import { useAddress } from "../../../lib/address";
import { useAddressCards, usePanelView } from "./usePanelView";

/** The two hooks over an address of their own, as the planner has them. */
function setUp(start: string, hasRoute: boolean) {
  return renderHook(
    ({ route }) => {
      const [address, setAddress] = useAddress();
      const cards = useAddressCards(address, setAddress, vi.fn());
      return { address, ...usePanelView({ cards, route, hasRoute: route !== "", address, setAddress }) };
    },
    { initialProps: { route: hasRoute ? "KMSN||KOSH" : "" }, wrapper: withNuqsTestingAdapter({ searchParams: start, hasMemory: true }) },
  );
}

describe("the place under the one search", () => {
  it("is the plan with a route and the search's own page with none", () => {
    expect(setUp("dep=KMSN&dest=KOSH", true).result.current.view).toBe("plan");
    expect(setUp("", false).result.current.view).toBe("search");
  });

  it("is the search for its lists in full, by the address, and an airplane's card leaves the place as it was", () => {
    expect(setUp("list=favorites", true).result.current.view).toBe("search");
    expect(setUp("saved=1", true).result.current.view).toBe("search");
    expect(setUp("near=1", true).result.current.view).toBe("search");
    expect(setUp("flight=a0b7d8", true).result.current.view).toBe("plan");
    expect(setUp("flight=a0b7d8", false).result.current.view).toBe("search");
  });

  it("lands an old link to the traffic's page on the one search, the flag let go", () => {
    // The traffic's page went for the one search (the owner, 2026-11-14).
    const hook = setUp("dep=KMSN&dest=KOSH&aircraft=1", true);
    expect(hook.result.current.view).toBe("search");
    expect(hook.result.current.address.aircraft).toBe(false);
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

  it("keeps a card for the place it was open over, and gives it back", () => {
    const hook = setUp("dep=KMSN&dest=KOSH&place=KOSH", true);
    act(() => hook.result.current.pickView("search"));
    expect(hook.result.current.address.place).toBeNull();
    act(() => hook.result.current.pickView("plan"));
    expect(hook.result.current.address.place).toBe("KOSH");
  });

  it("keeps an airplane's past flight over the plan while the search is up, and gives it back", () => {
    // The owner's ask (5fa10bde7): "if ... aircraft track is being played it
    // should show that when coming back".
    const hook = setUp("dep=KMSN&dest=KOSH&flight=a0b7d8&past=1794536008", true);
    act(() => hook.result.current.pickView("search"));
    expect(hook.result.current.address.flight).toBeNull();
    expect(hook.result.current.address.past).toBeNull();
    act(() => hook.result.current.pickView("plan"));
    expect(hook.result.current.address.flight).toBe("a0b7d8");
    expect(hook.result.current.address.past).toBe(1794536008);
  });
});
