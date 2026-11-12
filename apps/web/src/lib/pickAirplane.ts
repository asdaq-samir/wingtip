import { create } from "zustand";

/**
 * "Pick an airplane", from wherever a figure needs one: the Brief's weight
 * and balance and runway distances, the emergency assistant, the
 * diversion drill. Asked here, answered by the plan's workspace
 * (usePickAirplaneRequest), which goes to FPL, and by the airplane field
 * itself (FlightInputs), which takes the focus once drawn -- the picker
 * where it is, no new one (the owner, 2026-11-09: "Pick an airplane"
 * opens the existing picker). A store, not a window event and a lookup
 * by test id: the field focuses its own input.
 */
export const useAirplanePick = create<{ pending: boolean }>(() => ({ pending: false }));

/** Ask the plan's workspace to open the airplane picker. */
export function requestAirplanePick(): void {
  useAirplanePick.setState({ pending: true });
}

/** The airplane field has the focus: the ask is answered. */
export function airplanePickAnswered(): void {
  useAirplanePick.setState({ pending: false });
}
