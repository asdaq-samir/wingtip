import { create } from "zustand";

/** Whether the runways picked into the wind for the route's fields are
 *  still to come -- a field's forecast or report still being fetched --
 *  for Save to wait on (SaveFlightButton): a plan saved before them was
 *  saved without their runways and pattern miles, and the plan on screen
 *  a moment later was another (the owner's yes, 2026-10-28). Said by the
 *  route's Procedures (ProceduresRoute), false where they are not shown.
 *
 *  `settledFor`: the route (its fields) the picks had settled for at the
 *  last commit, for the nav log to wait on (usePlanRoute, WEB-14). */
export const useWindPicks = create<{ pending: boolean; settledFor: string | null }>(() => ({ pending: false, settledFor: null }));
