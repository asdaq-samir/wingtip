/**
 * The coach's two asks: the pilot's proficiency plan from the planner
 * (POST /api/pilot/coach, the engine's proficiency_plan: what is due and
 * when, what their debriefs show, the sessions) and the plan in words
 * from the assistant (POST /api/words/coach), each through the gateway.
 * The shapes are the services' own, generated from their documents.
 */
import { ApiError, csrfHeaders, failIfNotOk } from "../../../lib/api/client";
import { requestIdHeaders } from "../../../lib/api/requestId";
import type { components } from "../../../lib/api/schema";
import type { components as AssistantComponents } from "../../../lib/api/assistant-schema";

export type CoachAsk = components["schemas"]["CoachAsk"];
export type CoachDebrief = components["schemas"]["CoachDebrief"];
export type ProficiencyPlan = components["schemas"]["ProficiencyPlan"];
export type CoachSession = components["schemas"]["CoachSession"];
export type CoachDue = components["schemas"]["CoachDue"];
export type CoachWords = AssistantComponents["schemas"]["CoachWordsAnswer"];

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    signal,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...csrfHeaders("POST"), ...requestIdHeaders() },
  });
  if (res.status === 401) throw new ApiError("Sign in for your plan", 401);
  await failIfNotOk(res);
  return res.json() as Promise<T>;
}

export const coachApi = {
  plan: (ask: CoachAsk, signal?: AbortSignal) => post<ProficiencyPlan>("/api/planner/pilot/coach", ask, signal),
  words: (plan: ProficiencyPlan, signal?: AbortSignal) => post<CoachWords>("/api/planner/words/coach", plan, signal),
};
