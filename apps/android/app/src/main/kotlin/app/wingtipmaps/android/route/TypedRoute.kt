package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.routeProcedures
import app.wingtipmaps.android.engine.generated.routeRead

/**
 * What is typed in the route box, read as the web's route field and the
 * iPhone's TypedRoute read it: word by word by the engine's `route_read`
 * (item 15 of FAA Form 7233-4, AIM Appendix 4: DCT taken out, a speed and
 * level group not a point), a position's "@42.1,-88.2" kept whole where
 * the reader splits on its comma, and the SIDs and STARs the engine's
 * `route_procedures` names taken out, as they are procedures, not points.
 * Which word is a point is the engine's, never the app's.
 */
object TypedRoute {
    /** The points the words name, in order, upper case; null where the
     *  engine cannot read them. */
    fun points(text: String): List<String>? = runCatching {
        val points = mutableListOf<String>()
        for (word in text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }) {
            if (word.contains(",")) {
                points += word.uppercase()
                continue
            }
            points += Engine.routeRead(word).getOrThrow().points
        }
        val named = Engine.routeProcedures(points).getOrThrow().map { it.name }.toSet()
        points.filterNot { it in named }
    }.getOrNull()

    /**
     * The route with the typed points gone on at its end, as the web's box
     * takes what is typed after its last pill (routeEdit): on an empty
     * route the first is the departure and the last the destination, the
     * rest stops; with a departure alone the last is the destination; on a
     * whole route the last typed is the new destination and the old one a
     * stop on the way, as Maps' Add Stop does.
     */
    fun extended(route: RouteEdits.Route, typed: List<String>): RouteEdits.Route? {
        if (typed.isEmpty()) return null
        val all = (listOf(route.dep) + route.stops + route.dest).filter { it.isNotEmpty() } + typed
        if (all.size == 1) return RouteEdits.Route(all.first(), emptyList(), "")
        return RouteEdits.Route(all.first(), all.drop(1).dropLast(1), all.last())
    }
}

/** What is typed put on the route and planned, its Undo "Route Replaced"
 *  where an end changed (replaceRoute). False where the engine could not
 *  read it, for the box to say so where it was typed. */
fun Plan.typeRoute(text: String): Boolean {
    val typed = TypedRoute.points(text) ?: return false
    val s = state.value
    val next = TypedRoute.extended(RouteEdits.Route(s.dep, s.stops, s.dest), typed) ?: return true
    replaceRoute(next.dep, next.dest, next.stops)
    return true
}
