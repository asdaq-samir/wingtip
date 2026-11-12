// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { insetVars, setMapInsets, useMapInsets } from "./mapChrome";

const AT_REST = { top: 0, bottom: 120, left: 0, out: false, up: false };

afterEach(() => setMapInsets({ top: 0, bottom: 0, left: 0, out: false, up: false }));

describe("the map's insets", () => {
  it("tell their readers only of a change, not of a measurement that came out the same", () => {
    setMapInsets(AT_REST);
    let told = 0;
    const stop = useMapInsets.subscribe(() => told++);
    setMapInsets({ ...AT_REST });
    expect(told).toBe(0);
    setMapInsets({ ...AT_REST, out: true, bottom: 400 });
    stop();
    expect(told).toBe(1);
    expect(useMapInsets.getState()).toMatchObject({ bottom: 400, out: true });
  });

  it("are the map's element's CSS variables now and at each change, until the element goes", () => {
    setMapInsets(AT_REST);
    const el = document.createElement("main");
    const stop = insetVars(el);
    expect(el.style.getPropertyValue("--map-inset-bottom")).toBe("120px");
    setMapInsets({ ...AT_REST, bottom: 300, left: 320 });
    expect(el.style.getPropertyValue("--map-inset-bottom")).toBe("300px");
    expect(el.style.getPropertyValue("--map-inset-left")).toBe("320px");
    stop?.();
    setMapInsets({ ...AT_REST, bottom: 50 });
    expect(el.style.getPropertyValue("--map-inset-bottom")).toBe("300px");
  });
});
