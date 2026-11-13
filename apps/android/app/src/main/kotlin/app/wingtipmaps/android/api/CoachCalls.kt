package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.CoachAsk
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.api.generated.gateway.TrainingDto

// The Coach's calls, as the web's coachApi: the pilot's proficiency plan
// from the planner (POST /api/pilot/coach, the engine's proficiency_plan)
// through the gateway, and the pilot's training record, for a student's
// endorsements. Signed in only.

/** The engine's plan for the pilot (POST /api/pilot/coach). */
suspend fun Planner.coach(ask: CoachAsk): ProficiencyPlan =
    api.coachPlan(ask).planned()

/** The pilot's training record (GET /api/training); null signed out. */
suspend fun Gateway.training(): TrainingDto? = api.trainingGet().readOrNone()
