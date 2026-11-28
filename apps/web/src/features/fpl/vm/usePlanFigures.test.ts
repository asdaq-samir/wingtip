// @vitest-environment jsdom
/** The plan's engine figures asked once for the same inputs, not at every render (usePlanFigures). */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AircraftChoice, AircraftProfileSummary } from "../../../lib/api/types";
import { taxiFuelOf } from "../../../lib/aircraftChoice";
import { usePlanFigures } from "./usePlanFigures";

vi.mock("../../../lib/aircraftChoice", () => ({ cruiseTasOf: vi.fn(() => 110), taxiFuelOf: vi.fn(() => 1.1) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const aircraft = { profile: "c172", label: "C172 · Cessna 172", fuelBurnGph: 8.5 } as AircraftChoice;
const profiles = [{ name: "c172", fuel_burn_gph: 8 }] as AircraftProfileSummary[];

describe("usePlanFigures", () => {
  test("a render with nothing changed asks the engine nothing", () => {
    const props = { aircraft, profiles, engine: true };
    const { result, rerender } = renderHook((p) => usePlanFigures(p), { initialProps: props });
    rerender({ ...props });
    rerender({ ...props });
    expect(taxiFuelOf).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ cruiseTasKt: 110, fuelBurnGph: 8.5, taxiFuelGal: 1.1 });
  });

  test("no taxi fuel asked before the engine is there", () => {
    const { result } = renderHook(() => usePlanFigures({ aircraft, profiles, engine: false }));
    expect(taxiFuelOf).not.toHaveBeenCalled();
    expect(result.current.taxiFuelGal).toBeNull();
  });
});
