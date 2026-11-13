/**
 * The coach's ask: the pilot's proficiency plan from the planner (POST
 * /api/pilot/coach, the engine's proficiency_plan: what is due and when,
 * what their debriefs show, the sessions), through the gateway, on the
 * typed client (lib/api/client), which sends the CSRF header and the
 * request id and turns a failure into an ApiError. The shapes are the
 * planner's own, generated from its document.
 */
import { ApiError, planner } from "../../../lib/api/client";
import type { components } from "../../../lib/api/schema";

export type CoachAsk = components["schemas"]["CoachAsk"];
export type CoachDebrief = components["schemas"]["CoachDebrief"];
export type ProficiencyPlan = components["schemas"]["ProficiencyPlan"];
export type CoachSession = components["schemas"]["CoachSession"];
export type CoachDue = components["schemas"]["CoachDue"];

/** A 401 said as what to do: the plan is the signed-in pilot's. */
async function signedIn<T>(asked: Promise<{ data?: T }>): Promise<T> {
  try {
    return (await asked).data as T;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw new ApiError("Sign in for your plan", 401);
    throw err;
  }
}

export const coachApi = {
  plan: (ask: CoachAsk, signal?: AbortSignal) => signedIn(planner.POST("/api/pilot/coach", { body: ask, signal })),
};
