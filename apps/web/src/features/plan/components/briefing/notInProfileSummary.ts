import { useAirplaneChosen } from "../../../../lib/preferences";

/** A section's summary where its figures are an airplane's and there are
 *  none (NotInProfile): no airplane picked, or not in the picked one's
 *  profile. */
export function useNotInProfileSummary(): string {
  return useAirplaneChosen() ? "Not in this airplane's profile" : "Needs an airplane";
}
