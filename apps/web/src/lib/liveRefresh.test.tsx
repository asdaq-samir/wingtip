// @vitest-environment jsdom
/**
 * A live card keeps itself fresh: what has gone stale of its own queries
 * is asked again as the card is back in sight (lib/shown), and nothing
 * else's; the window's focus is TanStack's own refetch (lib/queryClient).
 */
import type { ReactNode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { ApiError } from "./api/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "./queryClient";
import { retryOnServerFailure } from "./queryRetry";
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

  it("asks what is stale again as the card is back in sight", () => {
    const { refetch, matches } = asked();
    let shown = true;
    const wrapper = ({ children }: { children: ReactNode }) => <Shown.Provider value={shown}>{children}</Shown.Provider>;
    const { rerender } = renderHook(() => useLiveRefresh("brief"), { wrapper });
    expect(refetch).not.toHaveBeenCalled();

    // Hidden under another card, then back in sight: what went stale
    // meanwhile is asked again.
    shown = false;
    rerender();
    expect(refetch).not.toHaveBeenCalled();
    shown = true;
    rerender();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]![0]).toMatchObject({ type: "active", stale: true });
    expect(matches("briefing")).toBe(true);
  });
});

describe("the query client's defaults", () => {
  it("refetches what is stale on focus, TanStack's default", () => {
    expect(queryClient.getDefaultOptions().queries!.refetchOnWindowFocus).toBeUndefined();
  });

  it("retries a server's failure up to three times, but never a request it refused", () => {
    expect(retryOnServerFailure(0, new ApiError("Bad gateway", 502))).toBe(true);
    expect(retryOnServerFailure(2, new ApiError("Bad gateway", 502))).toBe(true);
    expect(retryOnServerFailure(3, new ApiError("Bad gateway", 502))).toBe(false);
    expect(retryOnServerFailure(0, new ApiError("Not found", 404))).toBe(false);
    expect(retryOnServerFailure(0, new ApiError("Too many", 429))).toBe(true);
  });
});
