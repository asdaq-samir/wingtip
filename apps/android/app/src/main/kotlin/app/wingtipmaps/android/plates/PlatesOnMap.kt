package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.PlateOverlay
import app.wingtipmaps.android.api.planned
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The approach plates on the map, the app's one list (the owner,
 * 2026-11-11: "approach plates on the map, ForeFlight's way"): each
 * approach put there, one a field as the route flies one approach a
 * field, its plate placed once the planner has answered, and those the
 * pilot took off with the card's Hide Plate. A hidden plate comes back
 * when its approach is put on the map again, or with the Map Settings'
 * Approach Plates switch turned on (`showHidden`).
 *
 * The approach comes from the airport card's Approaches list
 * (`showChart`): this phone's route picks no procedures yet; once it
 * does, as the web's and the iPhone's do, the route's approach is shown
 * here the same way.
 *
 * @param plate the planner's plate for an approach, null where it has none placed.
 * @param approaches the CIFP identifiers of a field's approaches.
 */
class PlatesOnMap(
    private val scope: CoroutineScope,
    private val plate: suspend (PlatePick) -> PlateOverlay?,
    private val approaches: suspend (String) -> List<String>,
) {
    data class State(
        val picks: List<PlatePick> = emptyList(),
        val hidden: Set<PlatePick> = emptySet(),
        val placed: Map<PlatePick, PlacedPlate> = emptyMap(),
    ) {
        /** The plates drawn: each pick placed and not hidden, none while
         *  the Approach Plates switch is off. */
        fun drawn(look: PlateLook): List<PlacedPlate> =
            if (!look.shown) emptyList() else picks.filter { it !in hidden }.mapNotNull { placed[it] }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** An approach put on the map, in place of another at its field, and
     *  shown again if it was hidden; its plate asked for if not yet had. */
    fun show(pick: PlatePick) {
        _state.update { s -> s.copy(picks = s.picks.filter { it.ident != pick.ident } + pick, hidden = s.hidden - pick) }
        if (pick in _state.value.placed) return
        scope.launch {
            val placed = quietly { plate(pick) }?.let { PlacedPlate.of(pick, it) } ?: return@launch
            _state.update { s -> s.copy(placed = s.placed + (pick to placed)) }
        }
    }

    /** The card's Hide Plate: the plate off the map, its approach kept. */
    fun hide(pick: PlatePick) = _state.update { s -> s.copy(hidden = s.hidden + pick) }

    /** Every hidden plate back (the Approach Plates switch turned on). */
    fun showHidden() = _state.update { s -> s.copy(hidden = emptySet()) }

    /**
     * The approach whose plate is the field's d-TPP chart `chartName`
     * ("ILS OR LOC RWY 36", the airport card's row), put on the map; false
     * where none of the field's approaches has that plate placed. The
     * planner says which of its approaches each chart is (its plate's own
     * `name`), so the phone matches the names and reads nothing into them.
     */
    suspend fun showChart(ident: String, chartName: String): Boolean {
        val ids = quietly { approaches(ident) }.orEmpty()
        val found = coroutineScope {
            ids.map { id -> async { PlatePick(ident, id).let { p -> quietly { plate(p) }?.let { p to it } } } }.awaitAll()
        }.filterNotNull()
        val match = found.firstOrNull { (_, o) -> o.name.equals(chartName.trim(), ignoreCase = true) } ?: return false
        val placed = PlacedPlate.of(match.first, match.second) ?: return false
        _state.update { s -> s.copy(placed = s.placed + (match.first to placed)) }
        show(match.first)
        return true
    }

    private suspend fun <T> quietly(ask: suspend () -> T): T? =
        try {
            ask()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }

    companion object {
        /** The app's one list, asking the planner. */
        val shared: PlatesOnMap by lazy {
            PlatesOnMap(
                CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                plate = { p -> Planner.api.airportProcedurePlate(p.ident, p.procedure).planned() },
                approaches = { ident ->
                    Planner.api.airportProcedures(ident).planned().procedures.filter { it.kind == "approach" }.map { it.id }
                },
            )
        }
    }
}
