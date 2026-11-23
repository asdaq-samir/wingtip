// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import fixture from "../../lib/fixtures/routeFile.json";
import { api } from "../../lib/api/client";
import { callEngine } from "../../lib/engine/engine";
import type { SharedLink } from "../../lib/sharedFlight";
import { useRouteFilePlan } from "./useRouteFilePlan";

vi.mock("../../lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api/client")>()),
  api: { airspaceAt: vi.fn() },
}));

// The fields NASR lists as closed, as the airport index labels them (the
// engine's field_status, decision 0043).
const closed = new Map<string, string>();
vi.mock("../../lib/airportIndex", () => ({
  useAirportIndex: () => ({}),
  closedOf: (_index: unknown, ident: string) => closed.get(ident) ?? null,
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);

const linkOf = (text: string, fileName = "route.fpl"): SharedLink => ({
  kind: "file",
  fileName,
  read: callEngine("route_file_read", { text }),
});
const [fpl, gpx] = fixture.cases;

describe("a route file's plan", () => {
  beforeEach(() => {
    closed.clear();
    vi.mocked(api.airspaceAt).mockResolvedValue({ point: { ident: "MSN/060/25.1", name: "25.1 nm on 060° from MSN" } } as never);
  });
  afterEach(cleanup);

  test("its user point named off the nearest fix, as a dropped pin is; the plan offered once it is", async () => {
    const { result } = renderHook(() => useRouteFilePlan(linkOf(fpl!.text)), { wrapper });
    expect(result.current?.plan).toBeNull();
    await waitFor(() => expect(result.current?.plan).not.toBeNull());
    expect(api.airspaceAt).toHaveBeenCalledWith(43.5, -88.9);
    expect(result.current?.plan).toMatchObject({ dep: "KMSN", dest: "KOSH", stops: ["MSN", "MSN/060/25.1"], altitudeFt: null });
    expect(result.current?.rows.map((r) => r.title)).toEqual(["KMSN", "MSN", "USR001", "KOSH"]);
    expect(result.current?.title).toBe("KMSN TO KOSH");
  });

  test("a closed field between the ends is left out and said so; a closed end offers no plan", async () => {
    closed.set("MSN", "Closed indefinitely");
    const { result } = renderHook(() => useRouteFilePlan(linkOf(fpl!.text)), { wrapper });
    await waitFor(() => expect(result.current?.plan).not.toBeNull());
    expect(result.current?.plan?.stops).toEqual(["MSN/060/25.1"]);
    expect(result.current?.rows[1]).toEqual({ title: "MSN", ident: null, note: "Closed indefinitely: left out" });

    closed.set("KJVL", "Closed permanently");
    const end = renderHook(() => useRouteFilePlan(linkOf(gpx!.text, "trip.gpx")), { wrapper });
    await waitFor(() => expect(end.result.current?.naming).toBe(false));
    expect(end.result.current?.plan).toBeNull();
    expect(end.result.current?.problem).toBe("KJVL is closed permanently, and a closed field is never a route's end.");
  });

  test("a point no fix is near is left out and said so", async () => {
    vi.mocked(api.airspaceAt).mockResolvedValue({ point: null } as never);
    const { result } = renderHook(() => useRouteFilePlan(linkOf(gpx!.text, "trip.gpx")), { wrapper });
    await waitFor(() => expect(result.current?.plan).not.toBeNull());
    expect(result.current?.plan).toMatchObject({ dep: "C81", dest: "KJVL", stops: [] });
    expect(result.current?.rows[1]).toEqual({ title: "Lake Geneva", ident: null, note: "No fix near it: left out" });
  });

  test("a file that is not one says the engine's words, and no other link is one", () => {
    const { result } = renderHook(() => useRouteFilePlan(linkOf("<kml/>", "track.kml")), { wrapper });
    expect(result.current).toMatchObject({
      plan: null,
      problem: "This file is not a flight plan (.fpl) or a GPX route.",
      title: "track.kml",
    });
    const other = renderHook(() => useRouteFilePlan({ kind: "saved", token: "x".repeat(16) }), { wrapper });
    expect(other.result.current).toBeNull();
  });
});
