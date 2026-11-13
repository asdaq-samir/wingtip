package app.wingtipmaps.android.flight

import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.glideRing
import app.wingtipmaps.android.engine.generated.inFlight
import app.wingtipmaps.android.engine.generated.verticalSpeed
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
class InFlight {
    /** What the screens read. `problem` is the engine's words where one of
     *  its rules failed for this fix, shown on the instruments bar, so a
     *  figure left out is never taken for one the engine had none of. */
    data class State(
        val fix: OwnShip.Fix? = null,
        val progress: EngineContract.InFlightAnswer? = null,
        val verticalFpm: Double? = null,
        val glide: EngineContract.GlideRingAnswer? = null,
        /** At flying speed by the engine's `underway`. */
        val underway: Boolean = false,
        val problem: String? = null,
    ) {
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

    /** The airplane's own glide ratio (AirplaneNow: the pilot's over its book's), the ring's;
     *  none, no ring. */
    @Volatile
    var glideRatio: Double? = null

    /** Whether the map shows the glide ring (GlideRing.shown): the engine
     *  is asked for it only then, not at every fix for nothing. */
    @Volatile
    var ringShown: Boolean = false

    /** The nearest field's elevation, the ring's ground where no pack
     *  reaches, asked of the planner now and then while moving. */
    @Volatile
    private var fieldFt: Double? = null
    private var fieldAskedMs = 0L
    private var fieldAsking: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** Whether the airplane is at flying speed, told only when that
     *  changes: what the root and the map lay out by, so they are not
     *  drawn again at every fix. */
    val underway: StateFlow<Boolean> = state.map { it.underway }.distinctUntilChanged().stateIn(scope, SharingStarted.Eagerly, false)

    /** The GPS altitudes of the last seconds, for the vertical speed. */
    private val altitudes = ArrayDeque<Pair<Double, Double>>()

    /** The fix taken: the instruments worked out again from it and the
     *  plan. A null fix (own ship off) clears them. */
    fun took(fix: OwnShip.Fix?, plan: Plan.State, nowMs: Long = AppClock.nowMs()) {
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
        val vs = Engine.verticalSpeed(altitudes.map { EngineContract.VerticalSpeedInputSamplesItem(it.first, it.second) })
        val glide = if (ringShown) Engine.glideRing(fix.lat, fix.lon, fix.altitudeFt, fix.groundspeedKt, terrainFt, fieldFt, glideRatio) else Result.success(null)
        val progress = progress(fix, plan, nowMs)
        val underway = OwnShip.underway(fix.groundspeedKt)
        // The first rule that failed, in the engine's words (Engine.rule
        // has logged it); the figures it would have given are left out.
        val failed = listOf("vertical speed" to vs, "glide ring" to glide, "route progress" to progress, "flying speed" to underway)
            .firstNotNullOfOrNull { (what, r) -> r.exceptionOrNull()?.let { "The $what failed: ${it.message}" } }
        _state.update {
            State(
                fix = fix,
                progress = progress.getOrNull(),
                verticalFpm = vs.getOrNull(),
                glide = glide.getOrNull(),
                underway = underway.getOrDefault(false),
                problem = failed,
            )
        }
        // Where the engine could not say, the field is asked anyway: an
        // elevation fetched for nothing costs less than a ring on the
        // wrong ground.
        if (underway.getOrDefault(true)) askField(fix, nowMs)
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

    companion object {
        /** How often the nearest field is asked for the ring's ground: a
         *  field's elevation changes slowly as an airplane flies. */
        const val FIELD_EVERY_MS = 60_000L

        /** The engine's `in_flight` for a fix on the plan's route: the
         *  fields in order (the departure, the stops, the destination) are
         *  its waypoints. Null with no route. */
        fun progress(fix: OwnShip.Fix, plan: Plan.State, nowMs: Long = AppClock.nowMs()): Result<EngineContract.InFlightAnswer?> {
            val course = plan.course ?: return Result.success(null)
            val line = course.courseLine.filter { it.size == 2 }
            if (line.size < 2) return Result.success(null)
            val ends = listOf(course.departure) + course.stops.orEmpty() + listOf(course.destination)
            return Engine.inFlight(
                fix = EngineContract.InFlightInputFix(fix.lat, fix.lon, fix.trackDeg, fix.groundspeedKt),
                line = line,
                points = ends.map { EngineContract.InFlightInputPointsItem(it.ident, it.lat, it.lon) },
                legs = plan.legs.map { EngineContract.InFlightInputLegsItem(it.distanceNm, it.fuelGal) },
                fuelStartGal = plan.totals?.usableFuelGal,
                nowS = nowMs / 1000.0,
            )
        }
    }
}
