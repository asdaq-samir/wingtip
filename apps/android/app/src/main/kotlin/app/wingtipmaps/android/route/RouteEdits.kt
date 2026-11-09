package app.wingtipmaps.android.route

/**
 * The route's edits a leg's sheet makes, as the web's planAddress has
 * them (directToPatch, the route list's Remove): pure, so they are held
 * on the JVM (RouteLegTest); Plan applies them.
 */
object RouteEdits {
    /** A route as entered: its ends and its stops. */
    data class Route(val dep: String, val stops: List<String>, val dest: String)

    /** Direct to a stop or the destination of the route as it was before
     *  any Direct (`was`): from where the airplane is (`from`, a position
     *  as the planner reads one), else the departure, to it, and on
     *  through the stops after it; null for a point not on the route. */
    fun direct(was: Route, ident: String, from: String?): Route? {
        val at = was.stops.indexOfFirst { RoutePoints.same(it, ident) }
        if (at < 0 && !RoutePoints.same(was.dest, ident)) return null
        return Route(dep = from ?: was.dep, stops = if (at < 0) emptyList() else was.stops.drop(at), dest = was.dest)
    }

    /** The stops with one taken out. */
    fun without(stops: List<String>, ident: String): List<String> = stops.filterNot { RoutePoints.same(it, ident) }

    /** A stop moved `by` places (-1 up, +1 down), as the iPhone's Edit
     *  moves one; null where it is not a stop or would leave the stops. */
    fun moved(stops: List<String>, ident: String, by: Int): List<String>? {
        val at = stops.indexOfFirst { RoutePoints.same(it, ident) }
        val to = at + by
        if (at < 0 || to !in stops.indices) return null
        return stops.toMutableList().apply { add(to, removeAt(at)) }
    }

    /** Add a Stop After: `ident` a stop just after `after` -- the
     *  departure (first among the stops) or a stop; null after the
     *  destination, or after a point not on the route. */
    fun insertedAfter(route: Route, after: String, ident: String): List<String>? {
        val added = ident.trim().uppercase().ifEmpty { return null }
        val at = if (RoutePoints.same(route.dep, after)) 0 else route.stops.indexOfFirst { RoutePoints.same(it, after) }.takeIf { it >= 0 }?.plus(1)
        return at?.let { route.stops.toMutableList().apply { add(it, added) } }
    }
}
