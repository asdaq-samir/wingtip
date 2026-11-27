package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.routeTyped
import app.wingtipmaps.android.engine.generated.routeTypedPicks
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
     * The typed SIDs and STARs as picks, found among their fields'
     * procedures by the engine's `route_typed_picks`, the one copy the web's
     * route box and the iPhone's TypedRoute ask too (AIM 5-2-9, a SID out of
     * the departure; AIM 5-4-1, a STAR into the destination): a departure
     * from `dep`, its transition the point typed after it where published,
     * else an arrival into `dest` by the point typed before it. The names
     * neither field publishes come back as missed. `list` is a field's
     * procedures, null where they could not be had; where the engine cannot
     * answer, every typed name is missed, never a pick guessed.
     */
    suspend fun picks(read: Read, dep: String, dest: String, list: suspend (String) -> ProcedureList?): Pair<List<PlanProcedures.Pick>, List<String>> {
        if (read.procedures.isEmpty()) return emptyList<PlanProcedures.Pick>() to emptyList()
        val lists = mutableMapOf<String, ProcedureList?>()
        suspend fun listed(field: String) = field.takeIf { it.isNotEmpty() }?.let { lists.getOrPut(it) { list(it) } }
        val departure = listed(dep)?.let { l ->
            EngineContract.RouteTypedPicksInputDeparture(
                dep,
                l.procedures.map { EngineContract.RouteTypedPicksInputDepartureProceduresItem(it.kind, it.id, it.name, it.transitions) },
            )
        }
        val arrival = listed(dest)?.let { l ->
            EngineContract.RouteTypedPicksInputArrival(
                dest,
                l.procedures.map { EngineContract.RouteTypedPicksInputArrivalProceduresItem(it.kind, it.id, it.name, it.transitions) },
            )
        }
        val typed = read.procedures.map { EngineContract.RouteTypedPicksInputProceduresItem(it.name, it.before, it.after) }
        val answer = Engine.routeTypedPicks(typed, departure, arrival).getOrNull() ?: return emptyList<PlanProcedures.Pick>() to read.procedures.map { it.name }
        return answer.picks.map { PlanProcedures.Pick(it.ident, it.id, it.kind, it.name, it.transition) } to answer.missed
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
