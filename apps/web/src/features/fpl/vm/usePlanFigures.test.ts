// @vitest-environment jsdom
/** The plan's engine figures asked once for the same inputs, not at every render (usePlanFigures). */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AircraftChoice, AircraftProfileSummary, Totals } from "../../../lib/api/types";
import { taxiFuelOf } from "../../../lib/aircraftChoice";
import { windsOutOfDate } from "../../plan";
import { usePlanFigures } from "./usePlanFigures";

vi.mock("../../../lib/aircraftChoice", () => ({ cruiseTasOf: vi.fn(() => 110), taxiFuelOf: vi.fn(() => 1.1) }));
vi.mock("../../plan", () => ({ windsOutOfDate: vi.fn(() => false) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const aircraft = { profile: "c172", label: "C172 · Cessna 172", fuelBurnGph: 8.5 } as AircraftChoice;
const profiles = [{ name: "c172", fuel_burn_gph: 8 }] as AircraftProfileSummary[];
const totals = { ete_min: 90 } as Totals;

describe("usePlanFigures", () => {
  test("a render with nothing changed asks the engine nothing", () => {
    const props = { aircraft, profiles, engine: true, totals, minute: 0, depart: "" };
    const { result, rerender } = renderHook((p) => usePlanFigures(p), { initialProps: props });
    rerender({ ...props });
    rerender({ ...props });
    expect(taxiFuelOf).toHaveBeenCalledTimes(1);
    expect(windsOutOfDate).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ cruiseTasKt: 110, fuelBurnGph: 8.5, taxiFuelGal: 1.1, windsStale: false });
  });

  test("the winds asked again as the minute turns, the airplane's figures not", () => {
    const props = { aircraft, profiles, engine: true, totals, minute: 0, depart: "" };
    const { rerender } = renderHook((p) => usePlanFigures(p), { initialProps: props });
    rerender({ ...props, minute: 60_000 });
    expect(windsOutOfDate).toHaveBeenCalledTimes(2);
    expect(taxiFuelOf).toHaveBeenCalledTimes(1);
  });

  test("no taxi fuel asked before the engine is there", () => {
    const { result } = renderHook(() => usePlanFigures({ aircraft, profiles, engine: false, totals: null, minute: 0, depart: "" }));
    expect(taxiFuelOf).not.toHaveBeenCalled();
    expect(result.current.taxiFuelGal).toBeNull();
  });
});
