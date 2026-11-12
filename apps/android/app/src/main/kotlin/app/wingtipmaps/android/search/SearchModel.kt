package app.wingtipmaps.android.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private var searching: Job? = null
    private var types: List<AircraftProfileSummary>? = null
    private var nearestAt: Pair<Double, Double>? = null

    /**
     * A line as it is typed, found after a short pause so each key does not
     * ask the planner: the fields and fixes, the airplanes, and an N-number
     * in the FAA's registry. `near` is the airplane's position, which puts
     * the nearest of fields alike first.
     */
    fun type(text: String, own: Collection<OwnRecord>, near: Pair<Double, Double>?) {
        searching?.cancel()
        val q = text.trim()
        if (q.isEmpty()) {
            _state.update { it.copy(query = "", airports = emptyList(), waypoints = emptyList(), airplanes = emptyList(), loading = false, problem = null) }
            return
        }
        _state.update { it.copy(query = q, loading = true) }
        searching = viewModelScope.launch {
            delay(PAUSE_MS)
            val problems = mutableListOf<String>()
            val found = attempt(problems) { Planner.searchWithFixes(q, near?.let { (lat, lon) -> String.format(Locale.US, "%.4f,%.4f", lat, lon) }) }.orEmpty()
            val (airports, waypoints) = SearchGroups.split(found)
            val stock = types ?: attempt(problems) { Planner.aircraftProfiles() }?.also { types = it }.orEmpty()
            var airplanes = SearchGroups.airplanes(q, own, stock)
            if (SearchGroups.looksLikeTail(q)) {
                val registered = attempt(problems) { Planner.findAirplane(SearchGroups.compact(q)).registered }
                if (registered != null && !SearchGroups.isOwn(registered, own)) airplanes = listOf(AirplaneHit.Registered(registered)) + airplanes
            }
            _state.update {
                it.copy(airports = airports, waypoints = waypoints, airplanes = airplanes, loading = false, problem = problems.firstOrNull())
            }
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
