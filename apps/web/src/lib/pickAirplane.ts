/**
 * "Pick an airplane", from wherever a figure needs one: the Brief's weight
 * and balance and runway distances, the emergency assistant, the
 * diversion drill. Asked here, answered by the plan's workspace
 * (usePickAirplaneRequest), which goes to FPL and focuses its airplane
 * field (FlightInputs, "aircraft-select") -- the picker where it is, no
 * new one (the owner, 2026-11-09: "Pick an airplane" opens the existing
 * picker).
 */
export const PICK_AIRPLANE_EVENT = "wingtip:pick-airplane";

/** Ask the plan's workspace to open the airplane picker. */
export function requestAirplanePick(): void {
  window.dispatchEvent(new Event(PICK_AIRPLANE_EVENT));
}
