// @vitest-environment jsdom
/**
 * FPL's altitude pill on the stock Combobox (ui/combobox): its pill and
 * its "FL-" format kept, a figure typed flown as before, and the levels the
 * Altitude Advisor offers in its list, a pick flown as that figure typed.
 * The engine's wasm is loaded for every test file (lib/engine/vitestSetup.ts).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Leg, NavLogAltitude } from "../../lib/api/types";
import AltitudeGroup from "./AltitudeGroup";

afterEach(cleanup);

const leg = (altitude_ft: number) => ({ from: "KAAA", to: "KBBB", distance_nm: 40, altitude_ft }) as Leg;
const nav = {
  flown: "fastest",
  altitude_ft: null,
  options: [{ kind: "fastest", steps: [{ altitude_ft: 6500 }] }],
  altitude_figures: [
    { altitude_ft: 4500, ete_min: 60, fuel_gal: 9, tailwind_kt: -5, everywhere: true },
    { altitude_ft: 6500, ete_min: 55, fuel_gal: 9.5, tailwind_kt: 8, everywhere: true },
  ],
} as unknown as NavLogAltitude;

function pill(props: Partial<Parameters<typeof AltitudeGroup>[0]> = {}) {
  const onFlyAltitude = vi.fn();
  render(<AltitudeGroup nav={nav} legs={[leg(6500)]} onFlyAltitude={onFlyAltitude} {...props} />);
  return { onFlyAltitude, input: screen.getByTestId<HTMLInputElement>("altitude-input"), group: screen.getByTestId("altitude-group") };
}

describe("AltitudeGroup", () => {
  test("is the stock combobox in the pill, the altitude flown as FL-065", () => {
    const { input, group } = pill();
    expect(input.getAttribute("role")).toBe("combobox");
    expect(group.getAttribute("data-slot")).toBe("input-group");
    expect(group.getAttribute("aria-label")).toBe("Cruise altitude");
    expect(group.className).toMatch(/\bh-7\b/);
    expect(group.className).toMatch(/\brounded-full\b/);
    expect(input.value).toBe("FL-065");
  });

  test("with no altitude, empty, its placeholder FL-___", () => {
    const { input } = pill({ nav: null, legs: [] });
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("FL-___");
  });

  test("a figure typed is flown on Enter, as before", () => {
    const { input, onFlyAltitude } = pill();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "075" } });
    expect(input.value).toBe("FL-075");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFlyAltitude).toHaveBeenCalledWith(7500);
  });

  test("its list offers the advisor's levels, a pick flown as typed", async () => {
    const { input, onFlyAltitude } = pill();
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const levels = await screen.findAllByTestId("altitude-level");
    const words = levels.map((l) => l.textContent);
    expect(words).toContain("FL-045");
    expect(words).toContain("FL-065");
    fireEvent.click(levels.find((l) => l.textContent === "FL-045")!);
    expect(onFlyAltitude).toHaveBeenCalledWith(4500);
    expect(onFlyAltitude).toHaveBeenCalledTimes(1);
  });
});
