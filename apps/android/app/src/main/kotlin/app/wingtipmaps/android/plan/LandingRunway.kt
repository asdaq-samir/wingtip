package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.landingRunway

/**
 * The runway landed on at a field the route flies an approach to, the
 * engine's landing_runway (AIM 5-4-20; 14 CFR 91.175, the runway of
 * intended landing), as the web's landingRunway asks it: the approach's
 * own, straight in, where one is picked ("Land RWY 9" with an ILS 09, the
 * HIG review's Q3), a runway the wind or the pilot picked giving way to
 * it. Android does not yet read the plate's circling minimums here, so
 * `circling` is null, which the rule takes as none: the approach's own
 * runway always. Null at a field with no approach picked, where the
 * runway menu stands as it was.
 */
object LandingRunway {
    fun at(picks: PlanProcedures.State, ident: String, list: ProcedureList?): EngineContract.LandingRunwayAnswer? {
        val approach = PlanProcedures.at(picks, ident, listOf("approach")).firstOrNull() ?: return null
        val own = list?.procedures?.firstOrNull { it.id == approach.id }?.runway
        val picked = picks.landings[ident.uppercase()]
        return Engine.landingRunway(approach = true, straightIn = own, circling = null, picked = picked, byPilot = picked != null).getOrNull()
    }
}
