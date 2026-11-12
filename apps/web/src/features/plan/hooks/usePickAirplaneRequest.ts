import { useEffect } from "react";
import { useAirplanePick } from "../../../lib/pickAirplane";
import type { PanelView } from "./usePanelView";

/** Answers lib/pickAirplane's ask: FPL picked, at once, as the ask is
 *  made; the airplane field (FlightInputs) then focuses itself once drawn. */
export function usePickAirplaneRequest(pickView: (view: PanelView) => void): void {
  useEffect(
    () =>
      // Each ask, asked again while one waits too (the store's state is new
      // at every set).
      useAirplanePick.subscribe((now) => {
        if (now.pending) pickView("plan");
      }),
    [pickView],
  );
}
