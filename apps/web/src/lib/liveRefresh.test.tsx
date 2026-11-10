// @vitest-environment jsdom
/**
 * A live card keeps itself fresh: what has gone stale of its own queries
 * is asked again as the window comes back into focus and as the card is
 * back in sight (lib/shown), and nothing else's.
 */
import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "./queryClient";
import { refreshLive, useLiveRefresh } from "./liveRefresh";
import { Shown } from "./shown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const asked = () => {
  const refetch = vi.spyOn(queryClient, "refetchQueries").mockResolvedValue(undefined);
  const matches = (key: string) => {
    const call = refetch.mock.calls.at(-1)?.[0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean };
    return call.predicate({ queryKey: [key] });
  };
  return { refetch, matches };
};

describe("a live card's refresh", () => {
  it("asks the card's own queries again, and no others", async () => {
    const { refetch, matches } = asked();
    await refreshLive("airport");
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(matches("airport")).toBe(true);
    expect(matches("live")).toBe(true);
    expect(matches("navlog")).toBe(false);
  });

  it("asks what is stale again as the window comes back, and as the card is back in sight", () => {
    const { refetch, matches } = asked();
    let shown = true;
    const wrapper = ({ children }: { children: ReactNode }) => <Shown.Provider value={shown}>{children}</Shown.Provider>;
    const { rerender } = renderHook(() => useLiveRefresh("brief"), { wrapper });
    expect(refetch).not.toHaveBeenCalled();

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]![0]).toMatchObject({ type: "active", stale: true });
    expect(matches("briefing")).toBe(true);

    // Hidden under another card: the window's focus asks nothing.
    shown = false;
    rerender();
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(refetch).toHaveBeenCalledTimes(1);
    // Back in sight: what went stale meanwhile is asked again.
    shown = true;
    rerender();
    expect(refetch).toHaveBeenCalledTimes(2);
    focusManager.setFocused(undefined);
  });
});
