// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/client")>()),
  api: { logout: vi.fn(async () => undefined) },
}));
vi.mock("../../lib/checklists", () => ({ forgetChecklists: () => {} }));
vi.mock("../keptForAir", () => ({ forgetKeptRecord: () => {} }));
vi.mock("../../lib/pilotCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/pilotCache")>()),
  forgetPilotCache: () => {},
}));
const { useLogout } = await import("./useLogout");

describe("useLogout", () => {
  it("drops every record of the pilot's, now each is kept fresh for a minute", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const key of ["logbook", "training", "currency", "flights", "reminders"]) client.setQueryData([key], [key]);
    // Public data stays.
    client.setQueryData(["airport", "KMSN"], { ident: "KMSN" });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(() => result.current.mutateAsync());
    await waitFor(() => expect(client.getQueryData(["logbook"])).toBeUndefined());
    for (const key of ["training", "currency", "flights", "reminders"]) expect(client.getQueryData([key])).toBeUndefined();
    expect(client.getQueryData(["airport", "KMSN"])).toEqual({ ident: "KMSN" });
  });
});
