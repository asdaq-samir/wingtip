// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/client")>()),
  api: { logbook: { list: vi.fn() }, flights: { list: vi.fn() }, training: { get: vi.fn() } },
}));
const { api } = await import("./api/client");
const { RECORDS_FRESH_MS, flightsQuery, logbookQuery, trainingQuery } = await import("./queryClient");

/** A client with the app's own default, no staleTime: what each query
 *  says of itself is what holds. */
function wrapperOf(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe("the pilot's records", () => {
  it("are fresh for a minute, each", () => {
    for (const query of [flightsQuery, trainingQuery, logbookQuery]) expect(query.staleTime).toBe(RECORDS_FRESH_MS);
  });

  it("are asked once for a second reader mounted within the minute", async () => {
    vi.mocked(api.logbook.list).mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useQuery(logbookQuery), { wrapper: wrapperOf(client) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();
    // The Logbook opened after the You page: the same list, not asked again.
    const second = renderHook(() => useQuery(logbookQuery), { wrapper: wrapperOf(client) });
    expect(second.result.current.data).toEqual([]);
    await Promise.resolve();
    expect(api.logbook.list).toHaveBeenCalledTimes(1);
  });
});
