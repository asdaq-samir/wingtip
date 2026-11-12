package app.wingtipmaps.android.route

import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

/**
 * The leg of the route whose card is open (the web's useLegSheet and
 * RouteLegCard), one per activity, so the map cases the leg in green
 * while its card is on top (RootScreen follows the sheet's stack): the leg's ends, the
 * nav log's figures for it (the engine's: its length and magnetic
 * course), whether it is the leg being flown, and what can be done to its
 * end -- Direct to it, Remove a stop -- each only where the planner does it.
 */
@HiltViewModel
class RouteLegModel @Inject constructor() : ViewModel() {
    /** What the card shows. */
    data class View(
        val index: Int,
        val from: String,
        val to: String,
        /** The nav log's leg's own length and magnetic course; null until
         *  the leg streams in. */
        val distanceNm: Double?,
        val courseMagDeg: Double?,
        /** The leg arriving where the airplane is flying to. */
        val active: Boolean,
        /** Whether the route is flown direct to its end already. */
        val directOn: Boolean,
        /** Its end is a stop, which Remove takes out. */
        val removable: Boolean,
        /** The nav log's leg whole, for the card's figures; null until it
         *  streams in. */
        val leg: Leg? = null,
    )

    private val _selected = MutableStateFlow<Int?>(null)
    val selected: StateFlow<Int?> = _selected.asStateFlow()

    fun open(index: Int) {
        _selected.value = index
    }

    fun close() {
        _selected.value = null
    }

    companion object {
        /** The leg `index` of the plan as its card shows it; null where the
         *  route has no such leg (it was planned again meanwhile).
         *  `flyingTo` is the point the airplane is flying to, by ident. */
        fun view(index: Int, plan: Plan.State, flyingTo: String?): View? {
            val points = RoutePoints.of(plan.course)
            if (index < 0 || index + 1 >= points.size) return null
            val from = points[index]
            val to = points[index + 1]
            val leg = plan.legs.firstOrNull { RoutePoints.same(it.from, from.ident) && RoutePoints.same(it.to, to.ident) }
                ?: plan.legs.getOrNull(index)?.takeIf { RoutePoints.same(it.to, to.ident) }
            return View(
                index = index, from = from.ident, to = to.ident,
                distanceNm = leg?.distanceNm, courseMagDeg = leg?.magneticCourseDeg,
                active = flyingTo != null && RoutePoints.same(flyingTo, to.ident),
                directOn = plan.direct != null && RoutePoints.same(plan.direct, to.ident),
                removable = index + 1 < points.lastIndex,
                leg = leg,
            )
        }
    }
}
