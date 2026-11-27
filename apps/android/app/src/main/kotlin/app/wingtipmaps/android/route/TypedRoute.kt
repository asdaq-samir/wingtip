package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.routeTyped
import app.wingtipmaps.android.plan.PlanProcedures

/**
 * What is typed in the route box, read once by the engine's `route_typed`,
 * as the web's route field (routeEdit's readTyped) and the iPhone's
 * TypedRoute read it: word by word (item 15 of FAA Form 7233-4, AIM
 * Appendix 4: DCT taken out, a speed and level group the cruise's, a
 * position kept whole, the rest the points), and the SIDs and STARs among
 * the words taken out of the points, each with the points typed either
 * side of it, to be picked as the route's procedures. Which word is which
 * is the engine's, never the app's.
 */
object TypedRoute {
    data class Read(
        val points: List<String>,
        /** The cruise a level group asked for, feet MSL; null for none or VFR's. */
        val cruiseFt: Double?,
        val procedures: List<EngineContract.RouteTypedAnswerProceduresItem>,
    )

    /** What the words say; null where the engine cannot read them. */
    fun read(text: String): Read? =
        Engine.routeTyped(text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }).getOrNull()
            ?.let { Read(it.points, it.cruiseFt, it.procedures) }

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

    /**
     * The typed SIDs and STARs as picks, each found among its field's
     * procedures as the iPhone's TypedRoute.picks and the web's
     * typedProcedure find it: a departure from `dep`, its transition the
     * point typed after it where the procedure has that transition, else an
     * arrival into `dest` by the point typed before it. The names neither
     * field publishes come back as missed. `list` is a field's procedures,
     * null where they could not be had.
     */
    suspend fun picks(read: Read, dep: String, dest: String, list: suspend (String) -> ProcedureList?): Pair<List<PlanProcedures.Pick>, List<String>> {
        val picks = mutableListOf<PlanProcedures.Pick>()
        val missed = mutableListOf<String>()
        val lists = mutableMapOf<String, ProcedureList?>()
        for (typed in read.procedures) {
            var found: PlanProcedures.Pick? = null
            for ((field, kind, join) in listOf(Triple(dep, "departure", typed.after), Triple(dest, "arrival", typed.before))) {
                if (field.isEmpty()) continue
                val listed = lists.getOrPut(field) { list(field) } ?: continue
                val procedure = listed.procedures.firstOrNull { it.kind == kind && it.id == typed.name } ?: continue
                val transition = join?.takeIf { it in procedure.transitions }
                found = PlanProcedures.Pick(field, procedure.id, kind, procedure.name, transition)
                break
            }
            val picked = found
            if (picked != null) {
                picks.removeAll { it.ident == picked.ident && it.kind == picked.kind }
                picks += picked
            } else {
                missed += typed.name
            }
        }
        return picks to missed
    }

    /** How the typing went, for the box to say where it was typed. */
    sealed interface Outcome {
        data object Done : Outcome
        data object Unread : Outcome

        /** Typed procedures neither end publishes, by name, and the ends. */
        data class Missed(val names: List<String>, val dep: String, val dest: String) : Outcome
    }
}

/**
 * What is typed put on the route and planned: the typed SIDs and STARs
 * picked in place of their fields' picks of that kind, the cruise a level
 * group asks for the pilot's own (as a clearance's "maintain" is), and the
 * route's Undo "Route Replaced" where an end changed (replaceRoute).
 */
suspend fun Plan.typeRoute(text: String, list: suspend (String) -> ProcedureList?): TypedRoute.Outcome {
    val read = TypedRoute.read(text) ?: return TypedRoute.Outcome.Unread
    val s = state.value
    val next = TypedRoute.extended(RouteEdits.Route(s.dep, s.stops, s.dest), read.points)
    val dep = next?.dep ?: s.dep
    val dest = next?.dest ?: s.dest
    val (picks, missed) = TypedRoute.picks(read, dep, dest, list)
    picks.forEach { PlanProcedures.pick(it.ident, it.kind, it) }
    read.cruiseFt?.let { setAltitude(it) }
    if (next != null) replaceRoute(next.dep, next.dest, next.stops) else if (picks.isNotEmpty()) plan()
    return if (missed.isEmpty()) TypedRoute.Outcome.Done else TypedRoute.Outcome.Missed(missed, dep, dest)
}
