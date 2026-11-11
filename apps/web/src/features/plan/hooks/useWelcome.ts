import { useCallback, useEffect, useMemo, useState } from "react";
import { FIRST_FLIGHT, WELCOME, useTips, useWelcomeOpen } from "../../../lib/firstRunTips";
import { locateOnOpen, ownShipAvailable } from "../../../lib/map/position/ownShip";
import { askSearch } from "../../../lib/oneSearch";
import { permissionState } from "../../../lib/permissions";
import { NO_AIRPLANE, usePreferences } from "../../../lib/preferences";
import type { RouteParts } from "../components/RouteBox";
import { useAircraftPick } from "./useAircraftPick";
import { SAMPLE_FLIGHT } from "../lib/sampleFlight";

export { SAMPLE_FLIGHT };

/** "No Airplane" first and the default (docs/decisions/0011), then the
 *  pilot's own airplanes, each by its N-number. */
export const NONE = "none";

/**
 * The welcome's view model (Welcome, which shows it once on this device,
 * the first time the planner opens with no route, before the first
 * flight's card). One card, not a tour (docs/design/web.md §14): the
 * airplane, optional and No Airplane until one is picked, kept at once;
 * Plan a Flight, which hands over to the one search; the sample flight;
 * the location, asked only on the pilot's tap with why beside it (the
 * page's own ask waits for the welcome, locateOnOpen). Whichever way it
 * is left -- a button, Skip, Escape, the close -- it is seen for good, as
 * the tips are (Setup's Guide, Show Welcome and Tips Again, brings it back).
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

  const skip = useCallback(() => see(WELCOME), [see]);
  const planFlight = useCallback(() => {
    see(WELCOME);
    // The one search, focused with the sheet up (OneSearchField takes it).
    askSearch();
  }, [see]);
  const allowLocation = useCallback(() => {
    void locateOnOpen();
    setAskLocation(false);
  }, []);
  const openSample = useCallback(() => {
    see(WELCOME);
    see(FIRST_FLIGHT);
    onPlan(SAMPLE_FLIGHT);
    onOpened();
  }, [see, onPlan, onOpened]);

  return {
    airplane: aircraftValue === NONE || !airplanes.some((a) => a.value === aircraftValue) ? NONE : aircraftValue,
    airplanes,
    pickAirplane,
    askLocation,
    allowLocation,
    skip,
    planFlight,
    openSample,
  };
}
