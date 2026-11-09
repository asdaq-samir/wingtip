package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan

/**
 * What can be done at a point of the route, in one order and with one set
 * of words wherever its menu is (the iPhone's RoutePointMenu, the web's
 * PointMenuItems): its card first, the destination's Brief beside it,
 * Direct To, Hold Here, Add a Stop After, Move and Remove. Pure, so the
 * JVM tests hold it; RoutePointMenu draws it and Plan does it.
 */
object PointActions {
    enum class Role { DEPARTURE, STOP, DESTINATION }

    enum class Action { MORE_INFO, BRIEF, DIRECT_TO, HOLD_HERE, ADD_STOP_AFTER, MOVE_UP, MOVE_DOWN, REMOVE }

    /** Where the point is in the route as entered; null for a point of
     *  the log that is none of them (a hold's or a procedure's). */
    fun role(ident: String, s: Plan.State): Role? = when {
        RoutePoints.same(ident, s.dest) -> Role.DESTINATION
        s.stops.any { RoutePoints.same(it, ident) } -> Role.STOP
        RoutePoints.same(ident, s.dep) -> Role.DEPARTURE
        else -> null
    }

    /** The point's actions in the menu's order. Hold Here only where the
     *  course has found the point's place; Move only as far as the stops
     *  go; the departure is not flown to, and nothing is added after the
     *  destination. */
    fun of(ident: String, s: Plan.State): List<Action> {
        val role = role(ident, s) ?: return emptyList()
        val at = s.stops.indexOfFirst { RoutePoints.same(it, ident) }
        val placed = RoutePoints.of(s.course).any { RoutePoints.same(it.ident, ident) }
        return buildList {
            add(Action.MORE_INFO)
            if (role == Role.DESTINATION) add(Action.BRIEF)
            if (role != Role.DEPARTURE) add(Action.DIRECT_TO)
            if (placed) add(Action.HOLD_HERE)
            if (role != Role.DESTINATION) add(Action.ADD_STOP_AFTER)
            if (role == Role.STOP && at > 0) add(Action.MOVE_UP)
            if (role == Role.STOP && at < s.stops.lastIndex) add(Action.MOVE_DOWN)
            if (role == Role.STOP) add(Action.REMOVE)
        }
    }

    /** The point as the chart has it, for Hold Here. */
    fun chartPoint(ident: String, s: Plan.State): Plan.ChartPoint? =
        RoutePoints.of(s.course).firstOrNull { RoutePoints.same(it.ident, ident) }?.let { Plan.ChartPoint(it.ident, it.lat, it.lon) }

    /** Whether the route is flown direct to the point already, when its
     *  Direct To reads Fly as Planned and cancels it. */
    fun directOn(ident: String, s: Plan.State): Boolean = s.direct != null && RoutePoints.same(s.direct, ident)
}
