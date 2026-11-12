package app.wingtipmaps.android.here

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.AirspaceAt
import app.wingtipmaps.android.live.LiveSource
import app.wingtipmaps.android.live.PlannerLive
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * What's Here (the iPhone's and the web's AirspaceCard): the airspace
 * over a point held on the map, from the ground up, asked of the planner
 * (/api/airspace/at), which asks the engine each rule; the card only
 * writes its answer. The special-use areas are SpecialUseRows' own, with
 * SFDPS's word on each.
 */
@HiltViewModel
class HereModel @Inject constructor(private val source: LiveSource) : ViewModel() {
    data class State(
        val at: Pair<Double, Double>? = null,
        val here: AirspaceAt? = null,
        val problem: String? = null,
        val loading: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null

    /** The point asked of; asked again only where it moved, or on [retry]. */
    fun at(lat: Double, lon: Double) {
        if (_state.value.at == lat to lon && _state.value.problem == null) return
        asking?.cancel()
        _state.value = State(at = lat to lon, loading = true)
        asking = viewModelScope.launch {
            try {
                val here = source.airspaceAt(lat, lon)
                _state.value = State(at = lat to lon, here = here)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = State(at = lat to lon, problem = Problems.say("The airspace here could not be fetched", e))
            }
        }
    }

    fun retry() {
        val (lat, lon) = _state.value.at ?: return
        at(lat, lon)
    }
}
