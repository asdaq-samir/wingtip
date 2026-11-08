package app.wingtipmaps.android.flight

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.engine.Engine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The flight's instruments in the air (#218, the owner's option A of
 * 2026-11-08), the view model the map's instruments bar and the glide
 * ring read, as the iOS app's InFlight: each fix asked of the engine
 * once, and the answers kept. The engine works every figure
 * (motion::instruments): where the airplane is on the route and the next
 * waypoint's distance, time and arrival (`in_flight`), the vertical speed
 * from the GPS's altitudes (`vertical_speed`), and the still-air glide
 * ring over the ground under it (`glide_ring`). Nothing is worked out
 * here.
 *
 * A planning aid beside the airplane's own instruments: a phone's GPS is
 * not an approved navigation source (AC 120-76D), and the bar says so.
 */
class InFlight private constructor() {
    /** One waypoint ahead, as `in_flight` answers it. */
    @Serializable
    data class Waypoint(
        val index: Int,
        val name: String,
        @SerialName("distance_nm") val distanceNm: Double,
        @SerialName("bearing_deg") val bearingDeg: Double,
        @SerialName("bearing_mag_deg") val bearingMagDeg: Double? = null,
        @SerialName("ete_min") val eteMin: Double? = null,
        @SerialName("eta_s") val etaS: Double? = null,
        @SerialName("fuel_left_gal") val fuelLeftGal: Double? = null,
    )

    /** The airplane against its route, as `in_flight` answers it. */
    @Serializable
    data class Progress(
        @SerialName("on_route") val onRoute: Boolean,
        @SerialName("along_nm") val alongNm: Double,
        @SerialName("total_nm") val totalNm: Double,
        @SerialName("left_nm") val leftNm: Double,
        @SerialName("off_nm") val offNm: Double,
        @SerialName("off_side") val offSide: String? = null,
        @SerialName("desired_track_deg") val desiredTrackDeg: Double,
        @SerialName("desired_track_mag_deg") val desiredTrackMagDeg: Double? = null,
        @SerialName("track_mag_deg") val trackMagDeg: Double? = null,
        @SerialName("track_error_deg") val trackErrorDeg: Double? = null,
        @SerialName("variation_deg") val variationDeg: Double? = null,
        @SerialName("burnt_gal") val burntGal: Double,
        val next: Waypoint? = null,
        val destination: Waypoint? = null,
    )

    /** The glide ring, as `glide_ring` answers it: its outline as
     *  latitude and longitude pairs. */
    @Serializable
    data class Glide(
        @SerialName("range_nm") val rangeNm: Double,
        @SerialName("ground_ft") val groundFt: Double,
        val ring: List<List<Double>>,
    )

    /** What the screens read. */
    data class State(
        val fix: OwnShip.Fix? = null,
        val progress: Progress? = null,
        val verticalFpm: Double? = null,
        val glide: Glide? = null,
    ) {
        /** At flying speed by the engine's `underway`. */
        val underway: Boolean get() = OwnShip.underway(fix?.groundspeedKt)

        /** Flying the route: moving and within the engine's ON_ROUTE_NM of
         *  the line. */
        val onRoute: Boolean get() = progress?.onRoute == true
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The ground under the airplane from the packs (OwnShip.groundFt),
     *  the ring's first ground. */
    @Volatile
    var terrainFt: Double? = null

    /** The nearest field's elevation, the ring's ground where no pack
     *  reaches, asked of the planner now and then while moving. */
    @Volatile
    private var fieldFt: Double? = null
    private var fieldAskedMs = 0L
    private var fieldAsking: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** The GPS altitudes of the last seconds, for the vertical speed. */
    private val altitudes = ArrayDeque<Pair<Double, Double>>()

    /** The fix taken: the instruments worked out again from it and the
     *  plan. A null fix (own ship off) clears them. */
    fun took(fix: OwnShip.Fix?, plan: Plan.State, nowMs: Long = System.currentTimeMillis()) {
        if (fix == null) {
            altitudes.clear()
            _state.value = State()
            return
        }
        val t = fix.atMs / 1000.0
        fix.altitudeFt?.let { ft ->
            // The engine keeps its own window (VS_WINDOW_S); a little more
            // is kept here.
            altitudes.removeAll { it.first >= t || it.first < t - 15 }
            altitudes.addLast(t to ft)
        }
        val vs = try {
            Engine.call<VerticalSpeedAsk, Double?>("vertical_speed", VerticalSpeedAsk(altitudes.map { Sample(it.first, it.second) }))
        } catch (e: Exception) {
            null
        }
        val glide = try {
            Engine.call<GlideAsk, Glide?>(
                "glide_ring",
                GlideAsk(fix.lat, fix.lon, fix.altitudeFt, fix.groundspeedKt, terrainFt, fieldFt),
            )
        } catch (e: Exception) {
            null
        }
        _state.update { State(fix = fix, progress = progress(fix, plan, nowMs), verticalFpm = vs, glide = glide) }
        if (OwnShip.underway(fix.groundspeedKt)) askField(fix, nowMs)
    }

    /** The nearest field's elevation for the ring's ground, asked at most
     *  once a minute; the planner may be out of reach in the air, and the
     *  last answer stands then. */
    private fun askField(fix: OwnShip.Fix, nowMs: Long) {
        if (nowMs - fieldAskedMs < FIELD_EVERY_MS) return
        fieldAskedMs = nowMs
        fieldAsking?.cancel()
        fieldAsking = scope.launch {
            try {
                Planner.nearest(fix.lat, fix.lon, limit = 1).firstOrNull()?.let { fieldFt = it.elevationFt }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Out of reach: the last answer stands.
            }
        }
    }

    @Serializable
    private class Sample(@SerialName("t_s") val tS: Double, @SerialName("altitude_ft") val altitudeFt: Double)

    @Serializable
    private class VerticalSpeedAsk(val samples: List<Sample>)

    @Serializable
    private class GlideAsk(
        val lat: Double,
        val lon: Double,
        @SerialName("altitude_ft") val altitudeFt: Double?,
        @SerialName("speed_kt") val speedKt: Double?,
        @SerialName("terrain_ft") val terrainFt: Double?,
        @SerialName("field_ft") val fieldFt: Double?,
    )

    @Serializable
    class FixAsk(
        val lat: Double,
        val lon: Double,
        @SerialName("track_deg") val trackDeg: Double?,
        @SerialName("speed_kt") val speedKt: Double?,
    )

    @Serializable
    class PointAsk(val name: String, val lat: Double, val lon: Double)

    @Serializable
    class LegAsk(@SerialName("distance_nm") val distanceNm: Double, @SerialName("fuel_gal") val fuelGal: Double?)

    @Serializable
    class InFlightAsk(
        val fix: FixAsk,
        val line: List<List<Double>>,
        val points: List<PointAsk>,
        val legs: List<LegAsk>,
        @SerialName("fuel_start_gal") val fuelStartGal: Double?,
        @SerialName("now_s") val nowS: Double,
    )

    companion object {
        /** How often the nearest field is asked for the ring's ground: a
         *  field's elevation changes slowly as an airplane flies. */
        const val FIELD_EVERY_MS = 60_000L

        val shared: InFlight by lazy { InFlight() }

        /** The engine's `in_flight` for a fix on the plan's route: the
         *  fields in order (the departure, the stops, the destination) are
         *  its waypoints. Null with no route. */
        fun progress(fix: OwnShip.Fix, plan: Plan.State, nowMs: Long = System.currentTimeMillis()): Progress? {
            val course = plan.course ?: return null
            val line = course.courseLine.filter { it.size == 2 }
            if (line.size < 2) return null
            val ends = listOf(course.departure) + course.stops.orEmpty() + listOf(course.destination)
            val ask = InFlightAsk(
                fix = FixAsk(fix.lat, fix.lon, fix.trackDeg, fix.groundspeedKt),
                line = line,
                points = ends.map { PointAsk(it.ident, it.lat, it.lon) },
                legs = plan.legs.map { LegAsk(it.distanceNm, it.fuelGal) },
                fuelStartGal = plan.totals?.usableFuelGal,
                nowS = nowMs / 1000.0,
            )
            return try {
                Engine.call<InFlightAsk, Progress?>("in_flight", ask)
            } catch (e: Exception) {
                null
            }
        }
    }
}
