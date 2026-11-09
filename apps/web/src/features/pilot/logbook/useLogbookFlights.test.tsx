// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LogbookEntry } from "../../../lib/api/types";
import { blankEntry, requestOf } from "./logbookEntry";
import { useLogbookFlights } from "./useLogbookFlights";

vi.mock("../../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/api/client")>()),
  api: { logbook: { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() } },
}));
const { api } = await import("../../../lib/api/client");

const entry: LogbookEntry = { ...blankEntry("N12345"), id: 4, route: "C81 KDLH", totalHours: 2.1 };

function setUp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["logbook"], [entry]);
  // The list fetched again after a change: the gateway's, unchanged.
  vi.mocked(api.logbook.list).mockResolvedValue([entry]);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useLogbookFlights(), { wrapper });
}

function held<T>() {
  let settle!: { ok: (v: T) => void; no: (e: Error) => void };
  const promise = new Promise<T>((ok, no) => (settle = { ok, no }));
  return { promise, settle: () => settle };
}

describe("a logged flight changed in its row", () => {
  // Every answer is given before a test ends: React keeps every Action's
  // optimistic change until all the Actions running have ended.
  it("shows the new columns at once, the form closed", async () => {
    const answer = held<LogbookEntry>();
    vi.mocked(api.logbook.update).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.change(4));
    act(() => result.current.update(4, { ...requestOf(entry), totalHours: 2.4 }));
    expect(result.current.changing).toBeNull();
    expect(result.current.entries?.[0]?.totalHours).toBe(2.4);
    expect(result.current.saving).toBe(true);
    await act(async () => answer.settle().ok({ ...entry, totalHours: 2.4 }));
    await waitFor(() => expect(result.current.saving).toBe(false));
  });

  it("goes back where the gateway refuses, the form open on what was typed with why", async () => {
    const answer = held<LogbookEntry>();
    vi.mocked(api.logbook.update).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.update(4, { ...requestOf(entry), totalHours: 2.4 }));
    await act(async () => answer.settle().no(new Error("Total hours must be positive")));
    await waitFor(() => expect(result.current.entries?.[0]?.totalHours).toBe(2.1));
    expect(result.current.changing).toBe(4);
    expect(result.current.refused?.entry.totalHours).toBe(2.4);
    expect(result.current.refused?.problem).toMatch(/positive/);
  });
});

describe("a new flight logged", () => {
  it("is at the list's top at once, and the plus's form is back with why where it is refused", async () => {
    const answer = held<LogbookEntry>();
    vi.mocked(api.logbook.add).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.add({ ...blankEntry("N12345"), route: "KMSN KRYV" }));
    expect(result.current.entries?.[0]?.route).toBe("KMSN KRYV");
    expect(result.current.entries?.[0]?.id).toBeLessThan(0);
    await act(async () => answer.settle().no(new Error("refused")));
    await waitFor(() => expect(result.current.entries?.map((e) => e.id)).toEqual([4]));
    expect(result.current.adding).toBe(true);
    expect(result.current.refused?.id).toBeNull();
  });
});

describe("a logged flight deleted", () => {
  it("is gone at once with its Undo row", async () => {
    const answer = held<void>();
    vi.mocked(api.logbook.remove).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.remove(entry));
    expect(result.current.entries).toEqual([]);
    expect(result.current.undoWords).toMatch(/Deleted/);
    vi.mocked(api.logbook.list).mockResolvedValue([]);
    await act(async () => answer.settle().ok());
    await waitFor(() => expect(result.current.entries).toEqual([]));
  });
});
