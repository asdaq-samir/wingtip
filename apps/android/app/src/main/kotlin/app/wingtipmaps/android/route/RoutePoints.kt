package app.wingtipmaps.android.route

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Leg
import java.util.Locale

/** A point the route goes through: a field by its ident, or a place
 *  ("@41.8800,-87.6300") as the planner reads one; `fix` where it is a
 *  named fix flown through (the planner's AirportEnd kind "fix": a VFR or
 *  GPS waypoint), which the map marks as a turn (RouteTurns). */
data class RoutePoint(val ident: String, val name: String, val lat: Double, val lon: Double, val fix: Boolean = false)

/**
 * The route's points in the order flown -- the departure, the stops, the
 * destination, as /api/course found them -- and how the nav log's legs
 * line up with them. The phone plans no checkpoints of its own, so each
 * leg of the nav log runs from one of these points to the next; where
 * the log has a leg that does not (a hold's, a procedure's), `fixes` says
 * so with null rather than guessing a place for it.
 */
object RoutePoints {
    fun of(course: Course?): List<RoutePoint> {
        course ?: return emptyList()
        return (listOf(course.departure) + course.stops.orEmpty() + course.destination).map { RoutePoint(it.ident, it.name, it.lat, it.lon, it.kind == "fix") }
    }

    /** The legs' ends as the planner takes a briefing's fixes, one more
     *  than the legs, when each leg runs from one point to the next by
     *  ident; null when they do not line up. */
    fun fixes(points: List<RoutePoint>, legs: List<Leg>): List<RoutePoint>? {
        if (legs.isEmpty() || points.size != legs.size + 1) return null
        val lined = legs.withIndex().all { (i, leg) -> same(leg.from, points[i].ident) && same(leg.to, points[i + 1].ident) }
        return if (lined) points else null
    }

    /** "lat,lon;lat,lon" to five places, as the planner's `fixes` take them. */
    fun fixesParam(points: List<RoutePoint>): String =
        points.joinToString(";") { String.format(Locale.US, "%.5f,%.5f", it.lat, it.lon) }

    /** A field's ident as the log and the course may write it: KORD and
     *  ORD are one field. */
    fun same(a: String, b: String): Boolean {
        val x = a.trim().uppercase()
        val y = b.trim().uppercase()
        return x == y || (x.length == 4 && x.startsWith("K") && x.drop(1) == y) || (y.length == 4 && y.startsWith("K") && y.drop(1) == x)
    }
}
