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
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { Address } from "../../../lib/address";
import type { Airport, Leg } from "../../../lib/api/types";
import { endSimulation, simulateFix } from "../../../lib/map/position/dryRun";
import { useOwnFixShown } from "../../../lib/map/position/ownShip";
import { DRY_RUN, usePastFlight } from "../map/pastFlight";
import type { PanelView } from "./usePanelView";
import { useDryRun } from "./useDryRun";
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

const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);

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
