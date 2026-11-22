// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client")>()),
  api: { mapAges: vi.fn(async () => ({ data_cycles: [], metars_at: null, tfrs_at: null })) },
}));
const { api } = await import("../../api/client");
const { useDataCycles } = await import("./layerAges");

afterEach(() => vi.useRealTimers());

describe("useDataCycles", () => {
  it("asks for the editions once, not again each minute, read alone", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    renderHook(() => useDataCycles(), { wrapper });
    await waitFor(() => expect(api.mapAges).toHaveBeenCalledTimes(1));
    // Five minutes under the map with Ready to Fly's prompt reading it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(api.mapAges).toHaveBeenCalledTimes(1);
  });
});
