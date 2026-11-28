// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePreferences } from "../../preferences";
import { previewChartLook } from "./chartLookPreview";
import { useChartLook, useMapDim } from "./useChartLook";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

afterEach(() => act(() => previewChartLook({ dim: null, contrast: null })));

describe("a Dimmer's drag", () => {
  it("reaches the chart at each step and the marks only once committed", () => {
    act(() => usePreferences.getState().setChartDim("dark", 0.5));
    const look = renderHook(() => useChartLook());
    const marks = renderHook(() => useMapDim());
    expect(marks.result.current).toBe(0.5);
    act(() => previewChartLook({ dim: 0.6 }));
    // The chart's raster follows the finger; the kept value and the marks wait.
    expect(look.result.current.dim).toBe(0.6);
    expect(look.result.current.keptDim).toBe(0.5);
    expect(usePreferences.getState().chartDim.dark).toBe(0.5);
    expect(marks.result.current).toBe(0.5);
    act(() => {
      usePreferences.getState().setChartDim("dark", 0.6);
      previewChartLook({ dim: null });
    });
    expect(look.result.current.dim).toBe(0.6);
    expect(marks.result.current).toBe(0.4);
  });

  it("shows the Contrast's step and keeps the kept one till it is committed", () => {
    act(() => usePreferences.getState().setChartContrast(0));
    const look = renderHook(() => useChartLook());
    act(() => previewChartLook({ contrast: -0.2 }));
    expect(look.result.current.contrast).toBe(-0.2);
    expect(usePreferences.getState().chartContrast).toBe(0);
  });
});
