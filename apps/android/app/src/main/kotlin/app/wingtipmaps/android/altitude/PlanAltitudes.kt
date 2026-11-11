package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.api.generated.NavLogAltitude
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The route's altitudes beside the plan (Plan): what the planner said of
 * them -- its altitude line, with each legal altitude's time, fuel and
 * wind (the Altitude Advisor's rows) and the plans by name -- and what the
 * pilot set at points of the route in the profile (Start At, Cross At),
 * which the next plan asks for. Kept apart from Plan so its file stays one
 * job; Plan reads `query()` and hands it each altitude line.
 */
object PlanAltitudes {
    /** One point's altitude as the pilot set it in the profile. */
    data class Point(val ident: String, val ft: Double, val how: How)

    /** Where the change is flown (ForeFlight's words, the owner's spec of
     *  2026-11-10): from the waypoint on, or done by it. */
    enum class How { START_AT, CROSS_AT }

    /** `nearest`: the cruise was picked from the Advisor's legal rows, so
     *  each leg flies it where it may and its nearest legal altitude where
     *  not (the planner's `altitude_nearest`), as the row's figures were
     *  worked out; false, an altitude of the pilot's own on every leg. */
    data class State(val line: NavLogAltitude? = null, val points: List<Point> = emptyList(), val nearest: Boolean = false)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The planner's altitude line for the plan streaming in. */
    fun heard(line: NavLogAltitude) = _state.update { it.copy(line = line) }

    /** The cruise picked from the Advisor: at its legal rows' nearest or not. */
    fun nearest(on: Boolean) = _state.update { it.copy(nearest = on) }

    /** A point's altitude set (or replaced); Plan.plan() plans it. */
    fun set(point: Point) = _state.update { s -> s.copy(points = s.points.filterNot { it.ident == point.ident } + point) }

    /** A point's own altitude taken off: the plan's altitude there again. */
    fun remove(ident: String) = _state.update { s -> s.copy(points = s.points.filterNot { it.ident == ident }) }

    /** The route cleared: nothing of its altitudes kept. */
    fun clear() = _state.update { State() }

    /** The nav log's keys for what the pilot set: Cross At in the
     *  planner's `altitudes` ("IDENT:FEET", the hop into that point flown
     *  at it, the change done by it), Start At in `altitude_starts` (the
     *  same form, the change begun at the point), and `altitude_nearest`.
     *  A point the route no longer has is left out. */
    fun query(route: List<String>): Map<String, String?> {
        val s = _state.value
        return mapOf(
            "altitudes" to words(s.points, How.CROSS_AT, route).ifEmpty { null },
            "altitude_starts" to words(s.points, How.START_AT, route).ifEmpty { null },
            "altitude_nearest" to "true".takeIf { s.nearest },
        )
    }

    /** The points set `how`, on the route, as "IDENT:FEET,IDENT:FEET". */
    fun words(points: List<Point>, how: How, route: List<String>): String =
        points.filter { it.how == how && it.ident in route }.joinToString(",") { "${it.ident}:${Math.round(it.ft)}" }
}
