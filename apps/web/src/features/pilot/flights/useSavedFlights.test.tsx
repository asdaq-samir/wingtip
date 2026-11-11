// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FlightSummary } from "../../../lib/api/types";
import { flightsQuery } from "../../../lib/queryClient";
import { useSavedFlights } from "./useSavedFlights";

vi.mock("../../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/api/client")>()),
  api: { flights: { list: vi.fn(), update: vi.fn(), remove: vi.fn() } },
}));
const { api } = await import("../../../lib/api/client");
// The toast's Undo, kept to press or let go here.
const undos = vi.hoisted(() => [] as { words: string; undo: () => void; onClose?: () => void }[]);
vi.mock("../../../lib/toast", () => ({
  toast: {
    done: () => {},
    undo: (words: string, undo: () => void, data?: { onClose?: () => void }) => {
      undos.push({ words, undo, onClose: data?.onClose });
      return "undo";
    },
  },
}));

const flight = {
  id: 7,
  name: "Lake run",
  notes: null,
  departureIdent: "C81",
  destinationIdent: "KDLH",
  stops: [],
} as unknown as FlightSummary;

function setUp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(flightsQuery.queryKey, [flight]);
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useSavedFlights(), { wrapper });
}

/** A gateway answer held until the test gives it. */
function held<T>() {
  let settle!: { ok: (v: T) => void; no: (e: Error) => void };
  const promise = new Promise<T>((ok, no) => (settle = { ok, no }));
  return { promise, settle: () => settle };
}

describe("a saved flight renamed in its row", () => {
  it("shows the new name at once and keeps the gateway's answer", async () => {
    const answer = held<FlightSummary>();
    vi.mocked(api.flights.update).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.startChange(7));
    act(() => result.current.saveChange(flight, "Superior", ""));
    expect(result.current.changing).toBeNull();
    expect(result.current.list?.[0]?.name).toBe("Superior");
    expect(result.current.saving).toBe(true);
    await act(async () => answer.settle().ok({ ...flight, name: "Superior" }));
    await waitFor(() => expect(result.current.saving).toBe(false));
    expect(result.current.list?.[0]?.name).toBe("Superior");
    expect(result.current.problem).toBeNull();
  });

  it("goes back to the old name where the gateway refuses, the row open on what was typed with why", async () => {
    const answer = held<FlightSummary>();
    vi.mocked(api.flights.update).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.saveChange(flight, "Superior", "Fuel at KMSN"));
    expect(result.current.list?.[0]?.name).toBe("Superior");
    await act(async () => answer.settle().no(new Error("The name is at most 80 characters")));
    await waitFor(() => expect(result.current.list?.[0]?.name).toBe("Lake run"));
    expect(result.current.changing).toBe(7);
    expect(result.current.draft).toEqual({ name: "Superior", notes: "Fuel at KMSN" });
    expect(result.current.problem).toMatch(/80 characters/);
    // Escape: the row as it was, its problem put away.
    await act(async () => result.current.cancelChange());
    await waitFor(() => expect(result.current.problem).toBeNull());
    expect(result.current.changing).toBeNull();
  });

  it("says a name too long in the row without sending it", async () => {
    const { result } = setUp();
    vi.mocked(api.flights.update).mockClear();
    await act(async () => result.current.saveChange(flight, "a".repeat(81), ""));
    await waitFor(() => expect(result.current.problem).toMatch(/at most 80/));
    expect(api.flights.update).not.toHaveBeenCalled();
  });
});

describe("a saved flight deleted", () => {
  it("is gone at once, sent only once its Undo has gone, and back where the gateway refuses", async () => {
    const answer = held<void>();
    vi.mocked(api.flights.remove).mockReturnValue(answer.promise);
    const { result } = setUp();
    act(() => result.current.deleteFlight(flight));
    expect(result.current.list).toEqual([]);
    expect(undos.at(-1)?.words).toBe("Lake run Deleted");
    expect(api.flights.remove).not.toHaveBeenCalled();
    // The Undo let go: sent, and refused, so back in the list.
    act(() => undos.at(-1)!.onClose!());
    await waitFor(() => expect(api.flights.remove).toHaveBeenCalled());
    expect(vi.mocked(api.flights.remove).mock.calls[0]![0]).toBe(7);
    vi.mocked(api.flights.list).mockResolvedValue([flight]);
    await act(async () => answer.settle().no(new Error("refused")));
    await waitFor(() => expect(result.current.list?.map((f) => f.id)).toEqual([7]));
  });

  it("comes back from its Undo, and nothing is sent", () => {
    vi.mocked(api.flights.remove).mockClear();
    const { result } = setUp();
    act(() => result.current.deleteFlight(flight));
    expect(result.current.list).toEqual([]);
    act(() => undos.at(-1)!.undo());
    act(() => undos.at(-1)!.onClose!());
    expect(result.current.list?.map((f) => f.id)).toEqual([7]);
    expect(api.flights.remove).not.toHaveBeenCalled();
  });
});
