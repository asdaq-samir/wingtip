package app.wingtipmaps.android.copilot

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.copilotAround
import app.wingtipmaps.android.api.generated.CopilotAround
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.copilotWatch
import app.wingtipmaps.android.engine.generated.routePosition
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import java.util.Locale

/** The flight as planned, as the copilot reads it (the web's
 *  lib/copilot/flight): null with no route. */
data class CopilotFlight(
    val dest: String,
    val alternate: String?,
    val rules: String,
    /** The route's line, [lat, lon] from the departure. */
    val line: List<List<Double>>,
    /** The plan's ground speed over the whole flight, kt. */
    val plannedGsKt: Double?,
    val tasKt: Double?,
    val burnGph: Double?,
    /** The fuel on board at the start: the airplane's usable fuel. */
    val fuelGal: Double?,
    /** Anyone but the pilot aboard (FlightChoices), for 61.57(b)'s
     *  passengers at night. */
    val passengers: Boolean = false,
) {
    companion object {
        /** The plan's flight, once its nav log is whole, under the rules
         *  it was planned by, with the alternate its nav log flies on to
         *  (PlanAlternate, under IFR). */
        fun of(plan: Plan.State, passengers: Boolean = false): CopilotFlight? {
            val course = plan.course ?: return null
            if (!plan.routed || course.courseLine.size < 2) return null
            val totals = plan.totals
            val ete = totals?.eteMin
            return CopilotFlight(
                dest = plan.dest, alternate = plan.totals?.alternate?.ident, rules = plan.rules.uppercase(), line = course.courseLine,
                plannedGsKt = if (totals != null && ete != null && ete > 0) totals.distanceNm / (ete / 60) else null,
                tasKt = plan.legs.firstNotNullOfOrNull { it.tasKt },
                burnGph = plan.legs.firstNotNullOfOrNull { it.fuelBurnGph },
                fuelGal = totals?.usableFuelGal,
                passengers = passengers,
            )
        }
    }
}

/** Where the airplane is along the line: the miles left and the leg. */
data class Along(val leftNm: Double, val leg: Int)

/** The engine's rules the copilot asks (route_position, copilot_watch):
 *  a fake in the tests, which have no engine. */
interface CopilotRules {
    fun along(lat: Double, lon: Double, line: List<List<Double>>): Along?
    fun watch(input: EngineContract.CopilotWatchInput): EngineContract.CopilotWatchAnswer?
}

object EngineCopilot : CopilotRules {
    override fun along(lat: Double, lon: Double, line: List<List<Double>>): Along? =
        Engine.routePosition(EngineContract.RoutePositionInputAt(lat, lon), line = line).getOrNull()?.let { Along(it.leftNm, it.leg.toInt()) }

    /** A copilot that cannot answer says nothing rather than something
     *  wrong (Engine.rule logs why). */
    override fun watch(input: EngineContract.CopilotWatchInput): EngineContract.CopilotWatchAnswer? =
        with(input) {
            Engine.copilotWatch(
                nowS = nowS, own = own, fields = fields, rules = rules, minimums = minimums, fuelGal = fuelGal, burnGph = burnGph,
                tasKt = tasKt, dest = dest, alternate = alternate, remainingNm = remainingNm, plannedGsKt = plannedGsKt,
                passengers = passengers, nightCurrent = nightCurrent, areas = areas, itws = itws, ahead = ahead,
            ).getOrNull()
        }
}

/** The reports round the airplane: the planner, a fake in the tests. */
fun interface CopilotSource {
    suspend fun around(lat: Double, lon: Double, dest: String, alternate: String?, path: String): CopilotAround
}

val PlannerCopilot = CopilotSource { lat, lon, dest, alt, path -> Planner.copilotAround(lat, lon, dest, alt, path) }

/** The planner's answer in the contract's shapes, member by member by
 *  their names (the same snake case on both sides). */
object CopilotShapes {
    private val coder = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun fields(around: CopilotAround, firstSeen: Map<String, String?>): List<EngineContract.CopilotField> =
        around.fields.map { f -> coder.decodeFromJsonElement<EngineContract.CopilotField>(coder.encodeToJsonElement(f)).copy(plannedCategory = firstSeen[f.ident]) }

    fun areas(around: CopilotAround): List<EngineContract.CopilotWatchInputAreasItem> = around.areas.map { coder.decodeFromJsonElement(coder.encodeToJsonElement(it)) }

    fun itws(around: CopilotAround): List<EngineContract.CopilotWatchInputItwsItem> = around.itws.map { EngineContract.CopilotWatchInputItwsItem(it.airport, it.alert, it.words) }

    /** The rest of the route from the airplane, as /api/copilot/around
     *  takes it: from where it is, through the points after its leg,
     *  rounded to a few hundred metres so it is asked again only as the
     *  airplane goes somewhere new. */
    fun restOfRoute(lat: Double, lon: Double, line: List<List<Double>>, leg: Int): String {
        fun round(n: Double) = Math.round(n * 200) / 200.0
        return (listOf(listOf(lat, lon)) + line.drop(leg + 1)).filter { it.size == 2 }
            .joinToString(";") { String.format(Locale.US, "%s,%s", round(it[0]), round(it[1])) }
    }
}
