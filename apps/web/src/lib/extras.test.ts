// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The store read afresh from what this browser keeps, as at a page's load. */
async function load() {
  vi.resetModules();
  return import("./extras");
}

describe("the parked features' switches (Settings' Extras)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("are all off until turned on, and one turned on is kept for the next load", async () => {
    const { EXTRAS, useExtras } = await load();
    expect(EXTRAS.map((e) => e.key)).toEqual(["atcCopilot", "otherAirplanes", "modelWeather", "threeD", "trainingTools"]);
    for (const e of EXTRAS) expect(useExtras.getState()[e.key]).toBe(false);
    useExtras.getState().set("modelWeather", true);
    expect(JSON.parse(localStorage.getItem("wingtip.extras")!).state).toEqual({
      atcCopilot: false,
      otherAirplanes: false,
      modelWeather: true,
      threeD: false,
      trainingTools: false,
    });
    const again = (await load()).useExtras.getState();
    expect(again.modelWeather).toBe(true);
    expect(again.threeD).toBe(false);
  });

  it("read what a browser test seeds: the keys given on, the rest off", async () => {
    localStorage.setItem("wingtip.extras", JSON.stringify({ state: { atcCopilot: true }, version: 0 }));
    const kept = (await load()).useExtras.getState();
    expect(kept.atcCopilot).toBe(true);
    expect(kept.trainingTools).toBe(false);
  });

  it("keep 3D flat while it is parked, whatever the 3D button saved", async () => {
    const { useExtras, useThreeD } = await load();
    const { usePreferences } = await import("./preferences");
    usePreferences.getState().setThreeD(true);
    const { result } = renderHook(() => useThreeD());
    expect(result.current).toBe(false);
    act(() => useExtras.getState().set("threeD", true));
    expect(result.current).toBe(true);
  });
});
