package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.ai.ClaudeGate
import app.wingtipmaps.android.api.generated.CoachAsk
import app.wingtipmaps.android.api.generated.ProficiencyPlan
import app.wingtipmaps.android.api.generated.assistant.CoachWordsAnswer
import app.wingtipmaps.android.api.generated.gateway.TrainingDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

// The Coach's calls, as the web's coachApi: the pilot's proficiency plan
// from the planner (POST /api/pilot/coach, the engine's proficiency_plan)
// and the plan in words from the assistant (POST /api/words/coach), each
// through the gateway, and the pilot's training record, for a student's
// endorsements. Signed in only.

/** The plan as the words' ask sends it back: whole, its nulls written
 *  out, as the planner's ProficiencyPlan holds `until`, `from`,
 *  `days_left`, `place`, `approach` and `wings` required though they may
 *  be null, and Gateway.json leaves a null out (a generated field's null
 *  is its default, so the defaults are written too). */
val PlanJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = true
    encodeDefaults = true
}

/** The engine's plan for the pilot (POST /api/pilot/coach). */
suspend fun Planner.coach(ask: CoachAsk): ProficiencyPlan =
    api.coachPlan(ask).planned()

/** The plan in words (POST /api/words/coach): a short paragraph and a
 *  line a session, each citing the plan's own ids. Claude's, so never
 *  asked while the Claude features are off (ClaudeGate); the Coach then
 *  shows the engine's plan without them. */
suspend fun Planner.coachWords(plan: ProficiencyPlan): CoachWordsAnswer {
    ClaudeGate.require()
    return assistant.coachWords(PlanJson.encodeToJsonElement(plan).jsonObject).planned()
}

/** The pilot's training record (GET /api/training); null signed out. */
suspend fun Gateway.training(): TrainingDto? = api.trainingGet().readOrNone()
