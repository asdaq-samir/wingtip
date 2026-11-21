// @vitest-environment jsdom
/** The map's middle followed only while the search page asks round it (useSearchCentre). */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useMapCentre } from "../../../lib/map/mapCentre";
import { useSearchCentre } from "./useSearchCentre";

afterEach(() => {
  cleanup();
  act(() => useMapCentre.setState(null, true));
});

const counted = (wanted: boolean) => {
  let renders = 0;
  const hook = renderHook(
    ({ w }) => {
      renders++;
      return useSearchCentre(w);
    },
    { initialProps: { w: wanted } },
  );
  return { ...hook, renders: () => renders };
};

describe("useSearchCentre", () => {
  test("a pan does not draw a planner that is not asking", () => {
    const { result, renders } = counted(false);
    const before = renders();
    act(() => useMapCentre.setState({ lat: 42.1, lon: -88.05 }, true));
    act(() => useMapCentre.setState({ lat: 42.2, lon: -88.1 }, true));
    expect(result.current).toBeNull();
    expect(renders()).toBe(before);
  });

  test("followed while the search page asks, and read at once as it opens", () => {
    act(() => useMapCentre.setState({ lat: 42.1, lon: -88.05 }, true));
    const { result, rerender } = counted(false);
    rerender({ w: true });
    expect(result.current).toEqual({ lat: 42.1, lon: -88.05 });
    act(() => useMapCentre.setState({ lat: 42.2, lon: -88.1 }, true));
    expect(result.current).toEqual({ lat: 42.2, lon: -88.1 });
  });
});
