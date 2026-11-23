// @vitest-environment jsdom
/**
 * The dry run's own ship reaching Nearest. The flying screen's NRST puts
 * Nearest over the Profile card the run plays in (Search's page,
 * usePlanFlight's flyNearest), and the run went with the card's sight --
 * own ship's simulated fix with it, so Nearest, which measures from the
 * airplane's fix (useOwnFixShown), offered "Show my position" in a dry run
 * (flight-critical.spec). The cards (useFplCards) and the run (useDryRun)
 * wired as usePlanFpl and usePlanFlight wire them.
 */
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Address } from "../../../lib/address";
import type { Airport, Candidate, Leg } from "../../../lib/api/types";
import { endSimulation, simulateFix } from "../../../lib/map/position/dryRun";
import { useOwnFixShown } from "../../../lib/map/position/ownShip";
import { DRY_RUN, usePastFlight, type PanelView } from "../../plan";
import { useDryRun } from "../../flying";
import { useFplCards } from "./useFplCards";

const airport = (ident: string, lat: number, elevation: number): Airport =>
  ({ ident, name: ident, lat, lon: -88, elevation_ft: elevation, kind: "airport" }) as Airport;

// One 60 nm leg north at 100 kt over the ground, as dryRun.test's.
const leg = {
  distance_nm: 60,
  ete_min: 36,
  fuel_gal: 5,
  fuel_burn_gph: 8,
  altitude_ft: 5500,
  climb_min: 6,
  groundspeed_kt: 100,
  tas_kt: 110,
  true_course_deg: 0,
} as Leg;
const course = { departure: airport("C81", 42, 800), destination: airport("KDLH", 43, 500) };
const none = () => {};
const address = { saved: false, lesson: null } as unknown as Address;

/** The page's cards, the run and the fix Nearest reads, on the panel's page. */
function useFlight(view: PanelView) {
  const cards = useFplCards({
    view,
    routed: true,
    // Local: no Stops asked of the planner.
    local: true,
    planned: { dep: "C81", dest: "KDLH", stops: [] },
    fix: null,
    fuelStopPins: [],
    briefOpen: false,
    setViewPick: none,
    setPanel: none,
    address,
    setAddress: (() => Promise.resolve(new URLSearchParams())) as never,
    setProceduresShown: none,
  });
  const run = useDryRun({ course, selected: [], legs: [leg], depart: "", routed: true, profileOpen: cards.profileOpen });
  return { cards, run, nearestFrom: useOwnFixShown() };
}

// The address too: the run reads its procedures' missed approach from it (useAddressKey).
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(NuqsTestingAdapter, null, createElement(QueryClientProvider, { client: new QueryClient() }, children));

/** The Profile card opened on FPL and its dry run started. */
function flying() {
  const hook = renderHook(({ view }: { view: PanelView }) => useFlight(view), { initialProps: { view: "plan" }, wrapper });
  act(() => hook.result.current.cards.openProfileCard());
  act(() => hook.result.current.run.start());
  expect(hook.result.current.run.running).not.toBeNull();
  return hook;
}

afterEach(() => {
  cleanup();
  usePastFlight.setState({ hex: null, id: null, points: [], at: null, playing: false, stops: [] });
  endSimulation();
});

describe("a dry run with Nearest opened over it", () => {
  test("flies on, its own ship the fix Nearest measures from", () => {
    const hook = flying();
    // The map flies own ship from the replay (ReplayGl's simulateFix).
    const point = usePastFlight.getState().points[3]!;
    act(() => simulateFix(point));
    // NRST: Search's page, Nearest on it, over the Profile card.
    hook.rerender({ view: "search" });
    expect(hook.result.current.cards.profileShown).toBe(false);
    expect(usePastFlight.getState().hex).toBe(DRY_RUN);
    expect(hook.result.current.run.running).not.toBeNull();
    expect(hook.result.current.nearestFrom).toMatchObject({ lat: point.lat, lon: point.lon });
  });

  test("is put away once the Profile card is closed", () => {
    const hook = flying();
    act(() => hook.result.current.cards.closeProfileCard());
    expect(usePastFlight.getState().hex).toBeNull();
    expect(hook.result.current.run.running).toBeNull();
  });
});

describe("a dry run as the checkpoints' nav log streams in after the route as entered", () => {
  // The route as entered comes first, point to point, one leg; then the
  // checkpoints' log, its legs a few at a time (usePlan's pointToPoint).
  const half = { ...leg, distance_nm: 30, ete_min: 18, fuel_gal: 2.5 } as Leg;
  const checkpoint = { lat: 42.5, lon: -88, name: "Lake", category: "lake_or_pond", along_track_nm: 30 } as Candidate;
  type Log = { selected: Candidate[]; legs: Leg[] };
  const run = () =>
    renderHook(({ selected, legs }: Log) => useDryRun({ course, selected, legs, depart: "", routed: true, profileOpen: true }), {
      initialProps: { selected: [], legs: [leg] } as Log,
      wrapper,
    });

  test("flies on the whole run it has, not the log part way in, and on the new one once every leg is in", () => {
    const hook = run();
    act(() => hook.result.current.start());
    const asEntered = hook.result.current.running!;
    expect(asEntered.rows).toHaveLength(2);
    // The checkpoint's leg in, the destination's not yet: a run of it is
    // long enough to fly, but has no time at the destination, so the
    // next checkpoint over the map (FlyingHead) went (the desktop
    // emergency spec, run 45152106014).
    hook.rerender({ selected: [checkpoint], legs: [half] });
    expect(hook.result.current.ready).toBe(false);
    expect(hook.result.current.running).toBe(asEntered);
    expect(usePastFlight.getState().points).toBe(asEntered.points);
    // Every leg in: the checkpoints' run, its clock where it was.
    hook.rerender({ selected: [checkpoint], legs: [half, half] });
    expect(hook.result.current.ready).toBe(true);
    const whole = hook.result.current.running!;
    expect(whole.rows).toHaveLength(3);
    expect(whole.rowT.every((t) => t !== null)).toBe(true);
    expect(usePastFlight.getState().points).toBe(whole.points);
  });
});
