// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePastFlight, type ReplayPoint } from "../../../lib/replay/clock";
import PilotCamera from "./PilotCamera";

// A map that answers what the pilot's view asks of it, counting its moves.
const map = vi.hoisted(() => {
  const el = document.createElement("div");
  return {
    getContainer: () => el,
    getLayer: () => true,
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setPaintProperty: vi.fn(),
    getMaxZoom: () => 12,
    setMaxZoom: vi.fn(),
    getBearing: () => 0,
    queryTerrainElevation: () => 0,
    calculateCameraOptionsFromCameraLngLatAltRotation: () => ({}),
    jumpTo: vi.fn(),
    style: {},
  };
});
vi.mock("../../../lib/map/gl/glLayer", () => ({ useGlMap: () => ({ map }), slotId: (s: string) => `slot:${s}` }));

const point = (t: number): ReplayPoint => ({ t, lat: 42, lon: -88, alt_ft: 3500, track_deg: 90 }) as unknown as ReplayPoint;

afterEach(() => {
  vi.useRealTimers();
  usePastFlight.setState({ points: [], at: null });
});

describe("PilotCamera", () => {
  it("moves the camera as the run's clock moves, and asks for no frame while it stands still", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    usePastFlight.setState({ points: [point(0), point(60)], at: 0 });
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<PilotCamera />);
    vi.advanceTimersToNextFrame();
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    // Paused: no frame asked, none drawn.
    const asked = raf.mock.calls.length;
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(raf.mock.calls.length).toBe(asked);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    // The clock moves: one frame, one move.
    usePastFlight.setState({ at: 30 });
    vi.advanceTimersToNextFrame();
    expect(map.jumpTo).toHaveBeenCalledTimes(2);
  });
});
