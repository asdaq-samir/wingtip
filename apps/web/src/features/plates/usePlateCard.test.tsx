// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AirportPlace, PlateOverlay, TerminalChart } from "../../lib/api/types";
import { CardCloseContext } from "../../lib/map/cards/cardClose";
import { airportQuery, plateQuery } from "../../lib/queryClient";
import { usePreferences } from "../../lib/preferences";
import { LEAST_PLATE_OPACITY, PLATE_OPACITY, useHiddenPlates, usePlateLook } from "./plateLook";
import { chartOf, plateTitle, usePlateCard } from "./usePlateCard";

const ILS36: TerminalChart = { kind: "IAP", name: "ILS OR LOC RWY 36", url: "https://aeronav.faa.gov/d-tpp/2611/00078IL36.PDF" };
const charts: TerminalChart[] = [
  { kind: "APD", name: "AIRPORT DIAGRAM", url: "https://aeronav.faa.gov/d-tpp/2611/00078AD.PDF" },
  { kind: "IAP", name: "RNAV (GPS) RWY 36", url: "https://aeronav.faa.gov/d-tpp/2611/00078R36.PDF" },
  ILS36,
];

function setUp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(plateQuery("KOSH", "I36").queryKey, { name: "ILS OR LOC RWY 36", cycle: "2611" } as PlateOverlay);
  client.setQueryData(airportQuery("KOSH").queryKey, { procedures: charts } as unknown as AirportPlace);
  const close = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, createElement(CardCloseContext.Provider, { value: close }, children));
  return { close, ...renderHook(() => usePlateCard("KOSH", "I36"), { wrapper }) };
}

beforeEach(() => {
  usePlateLook.setState({ opacity: PLATE_OPACITY, inverted: false, annotations: true });
  useHiddenPlates.setState({ keys: [] });
});

describe("a plate's title", () => {
  it("is the field and the FAA's name in sentence case, its codes kept", () => {
    expect(plateTitle("KOSH", "ILS OR LOC RWY 36")).toBe("KOSH ILS or LOC rwy 36");
    expect(plateTitle("KOSH", "RNAV (GPS) RWY 36")).toBe("KOSH RNAV (GPS) rwy 36");
    expect(plateTitle("KOSH", null)).toBe("KOSH");
  });
});

describe("the plate's chart for View Full Screen", () => {
  it("is the field's approach chart of the plate's name", () => {
    expect(chartOf("ILS OR LOC RWY 36", charts)).toBe(ILS36);
    expect(chartOf("ils or loc rwy 36", charts)).toBe(ILS36);
    expect(chartOf("VOR RWY 9", charts)).toBeNull();
    expect(chartOf(null, charts)).toBeNull();
  });
});

describe("the plate's card", () => {
  it("names the plate and finds its chart", () => {
    const { result } = setUp();
    expect(result.current.title).toBe("KOSH ILS or LOC rwy 36");
    expect(result.current.chartUrl).toBe(ILS36.url);
    expect(result.current.fullScreen).toBe(false);
    act(() => result.current.openFullScreen());
    expect(result.current.fullScreen).toBe(true);
    act(() => result.current.closeFullScreen());
    expect(result.current.fullScreen).toBe(false);
  });

  it("hides the plate and puts the card away", () => {
    const { result, close } = setUp();
    act(() => result.current.hide());
    expect(useHiddenPlates.getState().keys).toEqual(["KOSH:I36"]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("sets the look the map draws the plates in, kept on the device", () => {
    const { result } = setUp();
    expect(result.current.annotations).toBe(true);
    act(() => result.current.setAnnotations(false));
    expect(usePlateLook.getState().annotations).toBe(false);
    act(() => result.current.setInverted(true));
    expect(result.current.inverted).toBe(true);
    act(() => result.current.setOpacity(0.5));
    expect(result.current.opacity).toBe(0.5);
    // Never wholly clear, never more than solid.
    act(() => result.current.setOpacity(0));
    expect(result.current.opacity).toBe(LEAST_PLATE_OPACITY);
    act(() => result.current.setOpacity(2));
    expect(result.current.opacity).toBe(1);
  });
});

describe("a hidden plate", () => {
  it("comes back when its approach is picked again", () => {
    useHiddenPlates.getState().hide("KOSH:I36");
    useHiddenPlates.getState().picked(["KOSH:I36"], ["KOSH:I36"]);
    expect(useHiddenPlates.getState().keys).toEqual(["KOSH:I36"]);
    useHiddenPlates.getState().picked(["KOSH:I36"], []);
    expect(useHiddenPlates.getState().keys).toEqual([]);
  });

  it("comes back when the Map menu's Approach Plates is turned on", () => {
    usePreferences.getState().setPlates(false);
    useHiddenPlates.getState().hide("KOSH:I36");
    usePreferences.getState().setPlates(true);
    expect(useHiddenPlates.getState().keys).toEqual([]);
  });
});
