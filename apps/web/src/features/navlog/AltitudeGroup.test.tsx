// @vitest-environment jsdom
/**
 * FPL's altitude pill on the stock InputGroup (ui/input-group): its pill
 * and its "FL-" format kept, a figure typed flown as before, and no list of
 * levels (the owner, 2026-11-17: "No need for drop down for FL"); what is
 * typed read by the engine's altitude_typed (the shared fixtures'
 * altitudes.json "typed"), flown once, and never let go of without a word.
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
  test("is the stock input group in the pill, the altitude flown as FL-065, no list", () => {
    const { input, group } = pill();
    expect(input.getAttribute("role")).toBeNull();
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

  // Typed, Enter, as a pilot does it: focused, the figures, Enter.
  const type = (input: HTMLInputElement, text: string) => {
    act(() => input.focus());
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: "Enter" });
  };

  test("Enter flies the figure once, not again as the field is left", () => {
    const { input, onFlyAltitude } = pill();
    type(input, "075");
    expect(onFlyAltitude).toHaveBeenCalledTimes(1);
    expect(onFlyAltitude).toHaveBeenCalledWith(7500);
    expect(document.activeElement).not.toBe(input);
  });

  test("the engine reads it: feet in four figures, written without FL-", () => {
    const { input, onFlyAltitude } = pill();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "FL-0751" } });
    fireEvent.change(input, { target: { value: "7500" } });
    expect(input.value).toBe("7500");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onFlyAltitude).toHaveBeenCalledExactlyOnceWith(7500);
  });

  test.each(["0450", "0045", "123456", "0"])("%s is no altitude: kept in red with the engine's reason, nothing flown", (text) => {
    const { input, onFlyAltitude } = pill();
    type(input, text);
    expect(onFlyAltitude).not.toHaveBeenCalled();
    expect(input.value).toBe(text.length > 3 ? text : `FL-${text}`);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const note = screen.getByTestId("altitude-note");
    expect(note.textContent).not.toBe("");
    expect(input.getAttribute("aria-describedby")).toContain(note.id);
  });

  test("six figures are the most it holds", () => {
    const { input } = pill();
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "12345678" } });
    expect(input.value).toBe("123456");
  });

  test("warn, never limit: VFR in Class A is flown, its warning said", () => {
    const { input, onFlyAltitude } = pill();
    type(input, "18000");
    expect(onFlyAltitude).toHaveBeenCalledExactlyOnceWith(18000);
    expect(screen.getByTestId("altitude-note").textContent).toMatch(/Class A/);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  test("IFR above FL410 is flown with its warning", () => {
    const { input, onFlyAltitude } = pill({ rules: "ifr" });
    type(input, "450");
    expect(onFlyAltitude).toHaveBeenCalledExactlyOnceWith(45000);
    expect(screen.getByTestId("altitude-note").textContent).toMatch(/FL410/);
  });

  test("what the altitude is and why is the field's description, not an image", () => {
    const { input } = pill();
    const why = screen.getByTestId("altitude-why");
    expect(why.getAttribute("role")).not.toBe("img");
    expect(input.getAttribute("aria-describedby")).toContain(why.id);
    expect(why.getAttribute("aria-label")).toMatch(/6,500 feet/);
  });
});
