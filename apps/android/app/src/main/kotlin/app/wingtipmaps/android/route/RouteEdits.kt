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
}
