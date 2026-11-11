import { useEffect } from "react";
import { PICK_AIRPLANE_EVENT } from "../../../lib/pickAirplane";
import type { PanelView } from "./usePanelView";

/** Answers lib/pickAirplane's ask: FPL picked, then its airplane field
 *  (FlightInputs' InlineField, "aircraft-select") focused once drawn. */
export function usePickAirplaneRequest(pickView: (view: PanelView) => void): void {
  useEffect(() => {
    const open = () => {
      pickView("plan");
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-testid="aircraft-select"] input')?.focus());
    };
    window.addEventListener(PICK_AIRPLANE_EVENT, open);
    return () => window.removeEventListener(PICK_AIRPLANE_EVENT, open);
  }, [pickView]);
}
