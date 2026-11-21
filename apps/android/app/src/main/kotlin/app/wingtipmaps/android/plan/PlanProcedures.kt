package app.wingtipmaps.android.plan

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.proceduresWrite
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * What the pilot picked at the route's fields on the plan's line, as the
 * web's FPL timeline and the iPhone's (5228f10df, the owner's option D of
 * 2026-11-21): the procedures flown -- an arrival and an approach into a
 * field, a departure out of one -- with any fix ATC sent the airplane
 * direct to; the runway each field is landed on and left from where the
 * pilot picked one (else the one into its report's wind); and altitudes
 * ATC gave to cross a procedure's fixes at. Sent to the planner with the
 * nav log (`query`), whose legs are flown by them and whose descents are
 * planned to them (PlanQuery's procedures, runways, patterns, crossings).
 * Kept apart from Plan, as PlanGround and PlanTanks are; cleared with the
 * route.
 */
object PlanProcedures {
    /** A procedure picked at a field: its CIFP id ("I36"), kind
     *  ("approach", "arrival", "departure"), chart name and transition. */
    data class Pick(val ident: String, val id: String, val kind: String, val name: String, val transition: String? = null) {
        /** The key a fix flown direct is kept by, "KOSH:I36". */
        val key: String get() = "${ident.uppercase()}:$id"
    }

    data class State(
        val picks: List<Pick> = emptyList(),
        /** Runway ends by field ident ("KMSN" to "36"), as the planner's
         *  `runways` (left from) and `patterns` (landed on, flown by its
         *  traffic pattern where no approach is picked) read them. */
        val takeoffs: Map<String, String> = emptyMap(),
        val landings: Map<String, String> = emptyMap(),
        /** The fix each procedure is flown direct to, by Pick.key. */
        val direct: Map<String, String> = emptyMap(),
        /** Feet MSL ATC gave to cross a fix at, by the fix's ident. */
        val crossings: Map<String, Int> = emptyMap(),
    )

    /** The kinds landed by and left by, in the order flown. */
    val ARRIVING = listOf("arrival", "approach")
    val LEAVING = listOf("departure")

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** A procedure picked in place of any of its kind at its field, or
     *  (null) that kind taken off the field; a fix flown direct on the one
     *  it replaces goes with it. */
    fun pick(ident: String, kind: String, pick: Pick?) = _state.update { s ->
        val gone = s.picks.filter { it.ident.equals(ident, ignoreCase = true) && it.kind == kind }
        s.copy(picks = s.picks - gone.toSet() + listOfNotNull(pick), direct = s.direct - gone.map { it.key }.toSet())
    }

    /** A runway picked to leave or land on, or (null) the wind's again. */
    fun setRunway(ident: String, end: String?, takeoff: Boolean) = _state.update { s ->
        val key = ident.uppercase()
        fun Map<String, String>.with() = if (end == null) this - key else this + (key to end)
        if (takeoff) s.copy(takeoffs = s.takeoffs.with()) else s.copy(landings = s.landings.with())
    }

    /** A procedure flown direct to one of its fixes, or (null) as charted. */
    fun setDirect(pick: Pick, fix: String?) = _state.update { s ->
        s.copy(direct = if (fix == null) s.direct - pick.key else s.direct + (pick.key to fix))
    }

    /** An altitude to cross a fix at, feet MSL, or (null) the chart's. */
    fun setCrossing(fix: String, ft: Int?) = _state.update { s ->
        val key = fix.uppercase()
        s.copy(crossings = if (ft == null) s.crossings - key else s.crossings + (key to ft))
    }

    /** The picks at a field of the given kinds, in the kinds' order. */
    fun at(state: State, ident: String, kinds: List<String>): List<Pick> =
        kinds.flatMap { kind -> state.picks.filter { it.ident.equals(ident, ignoreCase = true) && it.kind == kind } }

    fun clear() {
        _state.value = State()
    }

    /** Put back as an Undo had them. */
    fun restore(state: State) {
        _state.value = state
    }

    /**
     * The nav log's keys for the picks at the route's fields alone: the
     * procedures as the engine writes the planner's text ("KELD:I22::BXCMB",
     * a fix flown direct after a fourth colon: procedures_write, as the web
     * writes its address), `runways`, `patterns` and `crossings` as
     * "IDENT:VALUE" pairs, and `wind_runways`, so a field with no runway
     * picked is flown into its own report's wind, the runway its line names
     * (the planner's wind_picks; AC 90-66C 11.5 for the pattern flown).
     * `write` is the engine's writer, given in a unit test.
     */
    fun query(
        route: List<String>,
        state: State = _state.value,
        write: (List<EngineContract.ProceduresWriteInputPicksItem>) -> String? = { Engine.proceduresWrite(it).getOrNull() },
    ): Map<String, String?> {
        val on = route.map(String::uppercase).toSet()
        val picks = state.picks.filter { it.ident.uppercase() in on }
        val written = picks.takeIf { it.isNotEmpty() }?.let { list ->
            write(list.map { EngineContract.ProceduresWriteInputPicksItem(it.ident, it.id, it.transition, state.direct[it.key]) })
        }
        return mapOf(
            "procedures" to written?.ifEmpty { null },
            "runways" to pairs(state.takeoffs.filterKeys { it in on }),
            "patterns" to pairs(state.landings.filterKeys { it in on }),
            "crossings" to pairs(state.crossings.mapValues { it.value.toString() }),
            "wind_runways" to "true",
        )
    }

    /** "IDENT:VALUE" pairs in the idents' order; none for none. */
    fun pairs(values: Map<String, String>): String? =
        values.toSortedMap().map { (k, v) -> "$k:$v" }.joinToString(",").ifEmpty { null }
}
