package app.wingtipmaps.android.plan

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.route.RouteEdits
import java.io.IOException

/**
 * The route and nav log last planned whole: what is put back when a
 * re-plan fails, so the page never shows a half-changed route (the
 * offline audit's gap 3: a Direct To or a divert with no connection showed
 * the new route over the old legs, and said nothing). Set when the nav
 * log is done and when the kept plan is restored at launch.
 */
data class PlanShown(
    val route: RouteEdits.Route,
    val holds: List<String>,
    val direct: String?,
    val was: RouteEdits.Route?,
    val course: Course?,
    val legs: List<Leg>,
    val totals: NavLogTotals?,
    val plannedAtMs: Long?,
    val kept: Boolean,
) {
    companion object {
        /** What the page shows now, as the plan to fall back to. */
        fun of(s: Plan.State) = PlanShown(RouteEdits.Route(s.dep, s.stops, s.dest), s.holds, s.direct, s.was, s.course, s.legs, s.totals, s.plannedAtMs, s.kept)

        /** What is said where a change could not be planned for want of a
         *  connection: the route is as it was. */
        const val NOT_CHANGED = "Not changed: no connection."

        /**
         * The page after the planner failed on `now`'s route. With a whole
         * plan shown before, it comes back as it was, route, legs and
         * Direct alike: said nothing of where the route asked is the one
         * shown (the kept plan at launch, its age already said), "Not
         * changed: no connection." where it was a change, and the planner's
         * own words where it refused one. With none, the route asked
         * stands with no legs and why (Problems). `reverted` is whether
         * an edit was undone, so its Undo is let go.
         */
        fun failed(now: Plan.State, shown: PlanShown?, e: Exception): Pair<Plan.State, Boolean> {
            if (shown == null || shown.legs.isEmpty()) {
                return now.copy(legs = emptyList(), totals = null, stage = null, problem = Problems.say("The route could not be planned", e)) to false
            }
            val same = RouteEdits.Route(now.dep, now.stops, now.dest) == shown.route && now.holds == shown.holds
            val said = when {
                e is IOException && same -> now.problem
                e is IOException -> NOT_CHANGED.also { Problems.say("The route could not be changed", e) }
                else -> Problems.say(if (same) "The route could not be planned" else "The route could not be changed", e)
            }
            val back = now.copy(
                dep = shown.route.dep, dest = shown.route.dest, stops = shown.route.stops, holds = shown.holds,
                direct = shown.direct, was = shown.was, course = shown.course, legs = shown.legs, totals = shown.totals,
                plannedAtMs = shown.plannedAtMs, kept = shown.kept, stage = null, problem = said,
            )
            return back to !same
        }
    }
}
