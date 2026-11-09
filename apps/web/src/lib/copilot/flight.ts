import { create } from "zustand";

/** The flight as planned, as the copilot reads it: published by the
 *  planner's screen (features/plan's useCopilotPublish) and read by the
 *  copilot (features/copilot), so neither reaches into the other. Null
 *  with no route. */
export interface CopilotFlight {
  dest: string;
  /** The IFR alternate filed, where there is one. */
  alternate: string | null;
  rules: "VFR" | "IFR";
  /** The route's line, [lat, lon] points from the departure. */
  line: [number, number][];
  /** The plan's ground speed over the whole flight (its miles over its
   *  minutes), kt; null before the nav log is in. */
  plannedGsKt: number | null;
  tasKt: number | null;
  burnGph: number | null;
  /** The fuel on board at the start: the load the pilot set, else the
   *  airplane's usable fuel. Less the start and taxi allowance. */
  fuelGal: number | null;
  /** Whether anyone but the pilot is aboard, by the load's seats. */
  passengers: boolean;
}

export const useCopilotFlight = create<{ flight: CopilotFlight | null }>(() => ({ flight: null }));

export function publishCopilotFlight(flight: CopilotFlight | null) {
  useCopilotFlight.setState({ flight });
}
