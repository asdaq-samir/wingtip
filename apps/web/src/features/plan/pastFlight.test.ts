import { beforeEach, describe, expect, it } from "vitest";
import {
  choosePastFlight,
  clearPastFlight,
  legStep,
  pausePastFlight,
  playPastFlight,
  positionAt,
  stepPastFlight,
  stopPastFlight,
  usePastFlight,
} from "./pastFlight";

const POINTS = [
  { t: 1000, lat: 43.0, lon: -71.0, alt_ft: 1000, gs_kt: 90, track_deg: 90, vrate_fpm: 500 },
  { t: 1100, lat: 43.0, lon: -70.0, alt_ft: 3000, gs_kt: 110, track_deg: 90, vrate_fpm: 0 },
];

describe("a past flight replayed", () => {
  beforeEach(() => {
    clearPastFlight();
    choosePastFlight("a89c1e", 1000);
    usePastFlight.setState({ points: POINTS, speed: 10 });
  });

  it("puts the airplane between its reports in proportion, outside them nowhere", () => {
    expect(positionAt(POINTS, 1025)).toMatchObject({ t: 1025, lat: 43.0, lon: -70.75, alt_ft: 1500, gs_kt: 90 });
    expect(positionAt(POINTS, 999)).toBeNull();
    expect(positionAt(POINTS, 1101)).toBeNull();
  });

  it("plays from the start at its speed, stops at the end, and plays again from the start", () => {
    playPastFlight();
    expect(usePastFlight.getState().at).toBe(1000);
    stepPastFlight(5000); // 5 s at 10 times: 50 s of the flight
    expect(usePastFlight.getState().at).toBe(1050);
    pausePastFlight();
    stepPastFlight(5000);
    expect(usePastFlight.getState().at).toBe(1050);
    playPastFlight();
    stepPastFlight(60_000);
    expect(usePastFlight.getState()).toMatchObject({ at: 1100, playing: false });
    playPastFlight();
    expect(usePastFlight.getState().at).toBe(1000);
    stopPastFlight();
    expect(usePastFlight.getState()).toMatchObject({ at: null, playing: false });
  });

  it("under Reduce Motion steps the dry run leg by leg, the clock running on unseen", () => {
    expect(legStep(1030, [1000, 1040, 1080], 1100)).toBe(1000);
    expect(legStep(1045, [1000, 1040, 1080], 1100)).toBe(1040);
    expect(legStep(1200, [1000, 1040, 1080], 1100)).toBe(1100);
    expect(legStep(990, [1000, 1040], 1100)).toBe(990);
    usePastFlight.setState({ hex: "dry-run", id: 0, points: POINTS, stops: [1000, 1040, 1080], at: 1000, playing: true, speed: 10 });
    stepPastFlight(3000, true); // 30 s on: still at the first point
    expect(usePastFlight.getState().at).toBe(1000);
    stepPastFlight(2000, true); // 50 s on: jumped to the second
    expect(usePastFlight.getState().at).toBe(1040);
    stepPastFlight(10_000, true); // past the end: there, stopped
    expect(usePastFlight.getState()).toMatchObject({ at: 1100, playing: false });
  });

  it("tells no reader of the clock anything where nothing moved: paused, or a reduced-motion step inside a leg", () => {
    let told = 0;
    const stop = usePastFlight.subscribe(() => told++);
    stepPastFlight(5000); // never played
    expect(told).toBe(0);
    usePastFlight.setState({ hex: "dry-run", id: 0, points: POINTS, stops: [1000, 1040, 1080], at: 1000, playing: true, speed: 10 });
    told = 0;
    stepPastFlight(1000, true); // 10 s on: still at the first point
    stop();
    expect(told).toBe(0);
  });
});
