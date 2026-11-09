import { tailOf } from "../../../../lib/aircraftChoice";
import { usePreferences } from "../../../../lib/preferences";

/** A section's summary where its figures are an airplane's and it has
 *  none (AskFigure, which asks for them in the section): no airplane
 *  picked, or one whose figures lack what the section needs. */
export function useNotInProfileSummary(): string {
  const aircraft = usePreferences((s) => s.aircraft);
  if (aircraft.none) return "Needs an airplane";
  const tail = tailOf(aircraft);
  return tail ? `Needs ${tail}'s figures` : "Needs the airplane's figures";
}
