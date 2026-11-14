package app.wingtipmaps.android.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.api.registered
import app.wingtipmaps.android.airplane.InAir
import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.findAirplane
import app.wingtipmaps.android.api.generated.AircraftProfileSummary
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.api.searchWithFixes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/**
 * The one search's model: what a line typed finds, grouped (SearchGroups),
 * and the fields nearest the airplane for the list shown with nothing
 * typed. It finds with what the app already asks: the planner's airport
 * search with its fixes and navaids, the FAA registry by N-number
 * (/api/traffic/find's `registered`), the planner's airplane types and
 * the pilot's own airplanes. No figure is worked out here. Why a search
 * failed is said under the field, in the planner's words.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
class SearchModel @Inject constructor() : ViewModel() {
    data class State(
        val query: String = "",
        val airports: List<AirportSuggestion> = emptyList(),
        val waypoints: List<AirportSuggestion> = emptyList(),
        val airplanes: List<AirplaneHit> = emptyList(),
        val loading: Boolean = false,
        val problem: String? = null,
        /** The fields nearest the airplane, nearest first; null until asked. */
        val nearest: List<NearestAirport>? = null,
        val nearestProblem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** A line typed, with what it is found against; null for none. */
    private data class Ask(val q: String, val own: Collection<OwnRecord>, val near: Pair<Double, Double>?)

    private val asks = MutableStateFlow<Ask?>(null)
    private var types: List<AircraftProfileSummary>? = null
    private var nearestAt: Pair<Double, Double>? = null

    /**
     * A line as it is typed, found after a short pause so each key does not
     * ask the planner: the fields and fixes, the airplanes, and an N-number
     * in the FAA's registry. `near` is the airplane's position, which puts
     * the nearest of fields alike first.
     */
    fun type(text: String, own: Collection<OwnRecord>, near: Pair<Double, Double>?) {
        val q = text.trim()
        if (q.isEmpty()) {
            asks.value = null
            _state.update { it.copy(query = "", airports = emptyList(), waypoints = emptyList(), airplanes = emptyList(), loading = false, problem = null) }
            return
        }
        _state.update { it.copy(query = q, loading = true) }
        asks.value = Ask(q, own, near)
    }

    // The lines typed, asked once the typing pauses (Flow's debounce); a
    // cleared line passes at once, so the search under way stops with it
    // (collectLatest cancels the one before).
    init {
        viewModelScope.launch {
            asks.debounce { if (it == null) 0L else PAUSE_MS }.collectLatest { ask -> if (ask != null) find(ask) }
        }
    }

    private suspend fun find(ask: Ask) {
        val (q, own, near) = ask
        val problems = mutableListOf<String>()
        val found = attempt(problems) { Planner.searchWithFixes(q, near?.let { (lat, lon) -> String.format(Locale.US, "%.4f,%.4f", lat, lon) }) }.orEmpty()
        val (airports, waypoints) = SearchGroups.split(found)
        val stock = types ?: attempt(problems) { Planner.aircraftProfiles() }?.also { types = it }.orEmpty()
        val airplanes = SearchGroups.airplanes(q, own, stock)
        var registered: AircraftRegistration? = null
        if (SearchGroups.looksLikeTail(q)) {
            // The FAA's record by itself, from the planner's disk, drawn at
            // once; whether it is in the air follows from the live find,
            // which waits on the live sources (the owner, 2026-11-14: "Why
            // does looking up a plane takes a long time?").
            registered = attempt(problems) { Planner.registered(SearchGroups.compact(q)) }?.takeUnless { SearchGroups.isOwn(it, own) }
        }
        _state.update {
            it.copy(airports = airports, waypoints = waypoints, airplanes = listOfNotNull(registered?.let { r -> AirplaneHit.Registered(r) }) + airplanes, loading = false, problem = problems.firstOrNull())
        }
        if (registered != null) {
            val inAir = try {
                InAir.of(Planner.findAirplane(SearchGroups.compact(q)))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                InAir.Failed(Problems.say("Couldn't check whether it's in the air", e))
            }
            _state.update { s -> s.copy(airplanes = s.airplanes.map { if (it is AirplaneHit.Registered) it.copy(inAir = inAir) else it }) }
        }
    }

    /** The fields nearest a position, asked again only once it has moved. */
    fun loadNearest(lat: Double, lon: Double) {
        val at = (lat * 100).toInt() / 100.0 to (lon * 100).toInt() / 100.0
        if (at == nearestAt) return
        nearestAt = at
        viewModelScope.launch {
            try {
                val found = Planner.nearest(lat, lon, limit = NEAREST)
                _state.update { it.copy(nearest = found, nearestProblem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                nearestAt = null
                _state.update { it.copy(nearestProblem = Problems.say("The nearest fields could not be found", e)) }
            }
        }
    }

    /** A call's answer, or null with why it failed kept for the line under
     *  the field; one failing leaves the other groups shown. */
    private suspend fun <T> attempt(problems: MutableList<String>, call: suspend () -> T): T? = try {
        call()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Planner.Failure) {
        // An N-number the registry has no record of is no failure.
        if (e.status != 404) problems += Problems.say("The search failed", e)
        null
    } catch (e: Exception) {
        problems += Problems.say("The search failed", e)
        null
    }

    companion object {
        /** A pause in the typing before the planner is asked: a word is
         *  one ask rather than one a letter. */
        const val PAUSE_MS = 250L

        /** The nearest fields listed with nothing typed. */
        const val NEAREST = 3
    }
}
