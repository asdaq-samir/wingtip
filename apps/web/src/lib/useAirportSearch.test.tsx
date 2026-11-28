// @vitest-environment jsdom
/**
 * A stop's search (with `fixes`) shows the airports of the phone's own
 * copy until the planner answers with the waypoints too. When that
 * request fails (offline), those airports are the answer, so Enter may
 * take the first of them.
 */
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api/client")>()),
  api: { airportIndex: vi.fn(), airportSearch: vi.fn(), warmAirportIndex: vi.fn() },
}));

// Each test has lib/airportIndex afresh, as a page load does: it keeps the
// index it read (and the download it warmed) in the module, so a test that
// read it first left the next one nothing to warm. Shuffled, "is downloaded
// once the page is idle" failed after "is read when something is typed".
// Forgotten by forgetAirportIndex, not by importing every module again
// (vi.resetModules) before each test, which on a loaded Mac took past the
// hook's ten seconds (a run of 2026-11-10).
const { api } = await import("./api/client");
const { useAirportSearch } = await import("./useAirportSearch");
const { forgetAirportIndex } = await import("./airportIndex");

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

// Each hook unmounted after its test, so its timers go with it: the
// search's 100 ms debounce, and the 2 s stand-in for requestIdleCallback
// (jsdom has none). Testing Library unmounts by itself only where vitest
// has globals, which this config has not; left mounted, a timer fired
// after the file's jsdom was torn down and set state into a React with no
// window, an unhandled "window is not defined" that failed the run.
afterEach(cleanup);

beforeEach(() => {
  forgetAirportIndex();
  vi.clearAllMocks();
  vi.mocked(api.warmAirportIndex).mockResolvedValue(true);
  vi.mocked(api.airportIndex).mockResolvedValue({ airports: [["KOSH", "Wittman Regional", "Oshkosh", "WI", 1]] } as never);
});

describe("the phone's own copy", () => {
  test("is downloaded once the page is idle, read ahead at the next idle, and the focus finds it read", async () => {
    vi.stubGlobal("requestIdleCallback", (go: () => void) => setTimeout(go, 0));
    try {
      const { result } = renderHook(() => useAirportSearch("", true), { wrapper: wrapper() });
      await waitFor(() => expect(api.warmAirportIndex).toHaveBeenCalledTimes(1));
      // Read once the download is in and the page is idle again, before
      // any field is focused: not while the keyboard comes up.
      await waitFor(() => expect(api.airportIndex).toHaveBeenCalledTimes(1));
      const field = document.body.appendChild(document.createElement("input"));
      field.focus();
      await new Promise((go) => setTimeout(go, 20));
      expect(api.airportIndex).toHaveBeenCalledTimes(1);
      expect(result.current.rows).toEqual([]);
      field.remove();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the phone's own copy, where the search is off or only typed into", () => {
  test("is neither downloaded nor read when the search is off, even with a field focused", async () => {
    vi.stubGlobal("requestIdleCallback", (go: () => void) => setTimeout(go, 0));
    const field = document.body.appendChild(document.createElement("input"));
    try {
      renderHook(() => useAirportSearch("osh", false), { wrapper: wrapper() });
      field.focus();
      await new Promise((r) => setTimeout(r, 50));
      expect(api.warmAirportIndex).not.toHaveBeenCalled();
      expect(api.airportIndex).not.toHaveBeenCalled();
    } finally {
      field.remove();
      vi.unstubAllGlobals();
    }
  });

  test("is read when something is typed, with no field focused", async () => {
    // The planner is asked while the copy is still coming: an answer, not
    // the bare mock's undefined, which TanStack Query reports as an error
    // and the console guard failed the test on whenever the debounce won
    // the race with the copy's import.
    vi.mocked(api.airportSearch).mockResolvedValue([]);
    renderHook(() => useAirportSearch("osh", true), { wrapper: wrapper() });
    // Read after the search's debounce and a dynamic import, which a Mac
    // busy with builds took past waitFor's default second to finish.
    await waitFor(() => expect(api.airportIndex).toHaveBeenCalledTimes(1), { timeout: 5000 });
  });
});

describe("useAirportSearch with fixes and the copy in", () => {
  test("is answered by the copy's airports once the planner's request fails", async () => {
    vi.mocked(api.airportSearch).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAirportSearch("osh", true, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.rows[0]?.ident).toBe("KOSH");
  });

  test("is not answered while the planner's request is out", async () => {
    vi.mocked(api.airportSearch).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAirportSearch("osh", true, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(result.current.answered).toBe(false);
  });

  test("keeps the copy's airports where they are when the planner answers, its waypoints merged in", async () => {
    vi.mocked(api.airportSearch).mockResolvedValue([
      { ident: "OSHKO", name: "Oshko", municipality: null, region: null, kind: "fix" },
      { ident: "KOSH", name: "Wittman Regional", municipality: "Oshkosh", region: "US-WI", kind: "airport" },
    ] as never);
    const { result } = renderHook(() => useAirportSearch("osh", true, true), { wrapper: wrapper() });
    // The copy's airport first, as it was shown before the planner's
    // answer put the waypoint first.
    await waitFor(() => expect(result.current.rows.map((r) => r.ident)).toEqual(["KOSH", "OSHKO"]));
    expect(result.current.answered).toBe(true);
    expect(result.current.airportsAnswered).toBe(true);
  });

  test("keeps a field typed whole first, and highlighted, when a navaid of its ident comes in", async () => {
    // OSH is both Wittman Regional's FAA ID and the Oshkosh VORTAC: the
    // field the pilot saw first, highlighted for Enter by its place, stays
    // first, the navaid after it, the other waypoints after the airports.
    vi.mocked(api.airportIndex).mockResolvedValue({
      airports: [
        ["KOSH", "Wittman Regional", "Oshkosh", "WI", 1, 43.98, -88.56, "OSH"],
        ["KOSHA", "Oshawa", "Oshawa", "", 3],
      ],
    } as never);
    vi.mocked(api.airportSearch).mockResolvedValue([
      { ident: "OSH", name: "Oshkosh", municipality: null, region: null, kind: "fix" },
      { ident: "OSHKO", name: "Oshko", municipality: null, region: null, kind: "fix" },
    ] as never);
    const { result } = renderHook(() => useAirportSearch("osh", true, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.map((r) => r.ident)).toEqual(["KOSH", "OSH", "KOSHA", "OSHKO"]));
    expect(result.current.answered).toBe(true);
  });

  test("puts a navaid typed whole first where no field has its ident", async () => {
    vi.mocked(api.airportSearch).mockResolvedValue([{ ident: "OS", name: "Os", municipality: null, region: null, kind: "fix" }] as never);
    const { result } = renderHook(() => useAirportSearch("os", true, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.rows.map((r) => r.ident)).toEqual(["OS", "KOSH"]));
  });

  test("asks the planner once for letters typed again", async () => {
    vi.mocked(api.airportSearch).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ text }) => useAirportSearch(text, true, true), {
      wrapper: wrapper(),
      initialProps: { text: "osh" },
    });
    await waitFor(() => expect(result.current.answered).toBe(true));
    rerender({ text: "oshk" });
    await waitFor(() => expect(api.airportSearch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.answered).toBe(true));
    // The last letter taken back: the answer kept, not asked again.
    rerender({ text: "osh" });
    await waitFor(() => expect(result.current.typed).toBe("osh"));
    await new Promise((go) => setTimeout(go, 200));
    expect(api.airportSearch).toHaveBeenCalledTimes(2);
  });
});
