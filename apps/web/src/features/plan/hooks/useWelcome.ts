import { useCallback, useEffect, useMemo, useState } from "react";
import { FIRST_FLIGHT, WELCOME, useTips, useWelcomeOpen } from "../../../lib/firstRunTips";
import { locateOnOpen, ownShipAvailable } from "../../../lib/map/position/ownShip";
import { permissionState } from "../../../lib/permissions";
import { NO_AIRPLANE, usePreferences } from "../../../lib/preferences";
import { withPageTransition } from "../../../lib/viewTransition";
import type { RouteParts } from "../components/RouteBox";
import { useAircraftPick } from "./useAircraftPick";

/** The welcome's sample: Madison to Oshkosh, one short leg every app
 *  opens alike (the iPhone's and Android's welcome too), so a new pilot
 *  sees a route, its nav log and its Brief at once. */
export const SAMPLE_FLIGHT: RouteParts = { dep: "KMSN", stops: [], dest: "KOSH" };

export type WelcomeStep = "airplane" | "home" | "rules" | "location" | "ready";

/** The pages in order; Location only while the browser still has its
 *  question to ask (and can tell a position at all). */
export function welcomeSteps(askLocation: boolean): WelcomeStep[] {
  return askLocation ? ["airplane", "home", "rules", "location", "ready"] : ["airplane", "home", "rules", "ready"];
}

/** "No Airplane" first and the default (docs/decisions/0011), then the
 *  pilot's own airplanes, each by its N-number. */
export const NONE = "none";

/**
 * The welcome's view model (Welcome, which shows it once on this
 * device, the first time the planner opens with no route, before the
 * first flight's card): finished or skipped it is seen for good, as the tips are (Setup's
 * Guide, Show Welcome and Tips Again, brings it back). Each page writes
 * the preference it asks for at once -- the airplane, Home, VFR or IFR --
 * so Skip keeps what was said. Location asks the browser only on Allow,
 * the page having said why (locateOnOpen waits for the welcome). The last
 * page opens the sample flight, or hands over to the first flight's card.
 */
export function useWelcome({
  onPlan,
  onOpened,
}: {
  onPlan: (parts: RouteParts) => void;
  /** The sample planned: its nav log over the map (FPL's). */
  onOpened: () => void;
}) {
  const see = useTips((s) => s.see);
  const [askLocation, setAskLocation] = useState(ownShipAvailable());
  const [index, setIndex] = useState(0);
  const steps = useMemo(() => welcomeSteps(askLocation), [askLocation]);
  const step = steps[Math.min(index, steps.length - 1)]!;

  useEffect(() => {
    useWelcomeOpen.setState({ open: true });
    let gone = false;
    // A question the browser has answered already is not asked again.
    void permissionState("geolocation").then((state) => {
      if (!gone && (state === "granted" || state === "denied")) setAskLocation(false);
    });
    return () => {
      gone = true;
      useWelcomeOpen.setState({ open: false });
    };
  }, []);

  const { aircraftValue, aircraftChoices, changeAircraft } = useAircraftPick();
  const setAircraft = usePreferences((p) => p.setAircraft);
  const airplanes = useMemo(() => aircraftChoices.filter((c) => c.value !== NONE && c.label), [aircraftChoices]);
  const pickAirplane = useCallback(
    (value: string) => {
      if (value === NONE) setAircraft(NO_AIRPLANE);
      else changeAircraft(value);
    },
    [changeAircraft, setAircraft],
  );

  const home = usePreferences((p) => p.homeAirport);
  const setHome = usePreferences((p) => p.setHomeAirport);
  const rules = usePreferences((p) => p.flightRules);
  const setRules = usePreferences((p) => p.setFlightRules);

  const go = useCallback(
    (by: number) => {
      withPageTransition(() => setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + by))));
    },
    [steps.length],
  );
  const skip = useCallback(() => see(WELCOME), [see]);
  const allowLocation = useCallback(() => {
    void locateOnOpen();
    go(1);
  }, [go]);
  const openSample = useCallback(() => {
    see(WELCOME);
    see(FIRST_FLIGHT);
    onPlan(SAMPLE_FLIGHT);
    onOpened();
  }, [see, onPlan, onOpened]);

  return {
    step,
    index: steps.indexOf(step),
    count: steps.length,
    airplane: aircraftValue === NONE || !airplanes.some((a) => a.value === aircraftValue) ? NONE : aircraftValue,
    airplanes,
    pickAirplane,
    home,
    setHome,
    rules,
    setRules,
    next: () => go(1),
    back: () => go(-1),
    skip,
    allowLocation,
    openSample,
    planOwn: skip,
  };
}

export type WelcomeModel = ReturnType<typeof useWelcome>;
