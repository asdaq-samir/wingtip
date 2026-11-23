package app.wingtipmaps.android.offline

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.AircraftProfile
import app.wingtipmaps.android.api.generated.FlightPlates
import app.wingtipmaps.android.api.generated.PlateStateCharts
import app.wingtipmaps.android.api.generated.PlateStates
import app.wingtipmaps.android.api.planned
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

/** The planner's plate sets (wingtip.plate_sets), behind one seam so a
 *  test answers in its place. */
interface PlatesPlanner {
    suspend fun flight(ask: FlightPlatesAsk): FlightPlates
    suspend fun states(): PlateStates
    suspend fun state(cycle: String, id: String): PlateStateCharts

    /** The planner through the gateway (PlannerApi). */
    object Live : PlatesPlanner {
        override suspend fun flight(ask: FlightPlatesAsk): FlightPlates =
            Planner.api.flightPlates(ask.route, ask.fixes, ask.alternate, ask.eta, ask.tasKt, ask.usableGal, ask.burnGph).planned()

        override suspend fun states(): PlateStates = Planner.api.plateStates().planned()

        override suspend fun state(cycle: String, id: String): PlateStateCharts = Planner.api.plateState(cycle, id).planned()
    }
}

/**
 * The plates a flight keeps for the air, as the planner is asked them
 * (GET /api/plates/flight; the web's keepPlates): the plan's fields in
 * order, its course line thinned, the alternate filed, when it lands, and
 * the picked airplane's own cruise and fuel, from which the engine's
 * diversion_range_nm says how far off the route a field is still kept.
 * No airplane is assumed (decision 0011): with none picked they are left
 * out and the planner keeps no diversion fields.
 */
data class FlightPlatesAsk(
    val route: String,
    val fixes: String,
    val alternate: String?,
    val eta: String?,
    val tasKt: Double?,
    val usableGal: Double?,
    val burnGph: Double?,
) {
    /** The same flight, its arrival aside: with no departure set the ETA
     *  moves with the clock, which is no new flight. */
    val flight: FlightPlatesAsk get() = copy(eta = null)

    companion object {
        /** The route's points sent at most, the address kept short. */
        const val MOST_FIXES = 60

        /** The ask for `plan`, null with no route; `airplane` the nav log's
         *  profile of the airplane picked, none where none is. */
        fun of(plan: Plan.State, airplane: AircraftProfile?, nowMs: Long = AppClock.nowMs()): FlightPlatesAsk? {
            if (!plan.routed) return null
            val picked = airplane?.takeIf { plan.airplane }
            return FlightPlatesAsk(
                route = (listOf(plan.dep) + plan.stops + plan.dest).filter { it.isNotBlank() && !it.startsWith("@") }.joinToString(","),
                fixes = fixes(plan.course?.courseLine.orEmpty().filter { it.size == 2 }),
                alternate = PlanAlternate.of(plan.rules, plan.dest) ?: plan.totals?.alternate?.ident,
                eta = PlanAlternate.landsAt(plan.depart, plan.totals?.eteMin, nowMs),
                tasKt = picked?.cruiseTasKt,
                usableGal = picked?.usableFuelGal,
                burnGph = picked?.fuelBurnGph,
            )
        }

        /** "lat,lon;…", a long line thinned to MOST_FIXES with both ends kept:
         *  every step-th point from the first, the steps fitting between the
         *  ends, and the last. */
        fun fixes(line: List<List<Double>>): String {
            val step = maxOf(1, ceil((line.size - 1) / (MOST_FIXES - 1).toDouble()).toInt())
            return line.filterIndexed { i, _ -> i % step == 0 || i == line.lastIndex }
                .joinToString(";") { String.format(Locale.US, "%.4f,%.4f", it[0], it[1]) }
        }
    }
}

/**
 * The line said before Keep for the Air (the web's flightPlatesLine): the
 * flight's plates' size, about, its fields, and how far off the route
 * they reach; with no airplane picked, that one is needed for the
 * diversions' (`rangeNm` null). Drawn with plates_flight_size(_no_airplane).
 */
data class FlightPlatesLine(val mb: String, val fields: Int, val rangeNm: Int?) {
    companion object {
        fun of(plates: FlightPlates?): FlightPlatesLine? {
            plates ?: return null
            val range = if (plates.basis == "no_airplane") null else (plates.rangeNm ?: 0.0).roundToInt()
            return FlightPlatesLine(aboutMb(plates.bytes), plates.fields.size, range)
        }

        /** A size as the app says one kept, the number of "about N MB":
         *  whole megabytes from one up, tenths under it, never none. */
        fun aboutMb(bytes: Long): String {
            val mb = bytes / 1e6
            return if (mb >= 1) mb.roundToInt().toString() else String.format(Locale.US, "%.1f", maxOf(0.1, (mb * 10).roundToInt() / 10.0))
        }
    }
}
