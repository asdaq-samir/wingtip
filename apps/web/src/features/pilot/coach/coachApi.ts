/**
 * The coach's two asks: the pilot's proficiency plan from the planner
 * (POST /api/pilot/coach, the engine's proficiency_plan: what is due and
 * when, what their debriefs show, the sessions) and the plan in words
 * from the assistant (POST /api/words/coach), each through the gateway,
 * on the typed clients (lib/api/client), which send the CSRF header and
 * the request id and turn a failure into an ApiError. The shapes are the
 * services' own, generated from their documents.
 */
import { ApiError, assistant, planner } from "../../../lib/api/client";
import type { components } from "../../../lib/api/schema";
import type { components as AssistantComponents } from "../../../lib/api/assistant-schema";

export type CoachAsk = components["schemas"]["CoachAsk"];
export type CoachDebrief = components["schemas"]["CoachDebrief"];
export type ProficiencyPlan = components["schemas"]["ProficiencyPlan"];
export type CoachSession = components["schemas"]["CoachSession"];
export type CoachDue = components["schemas"]["CoachDue"];
export type CoachWords = AssistantComponents["schemas"]["CoachWordsAnswer"];

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
  words: (plan: ProficiencyPlan, signal?: AbortSignal) => signedIn(assistant.POST("/api/words/coach", { body: plan, signal })),
};
