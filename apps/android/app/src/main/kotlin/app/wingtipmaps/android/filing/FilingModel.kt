package app.wingtipmaps.android.filing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.file
import app.wingtipmaps.android.api.flightService
import app.wingtipmaps.android.api.generated.gateway.FlightPlanFilingRequest
import app.wingtipmaps.android.api.generated.gateway.FlightServiceStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Filing's view model (FilingPage, MVVM), as the iPhone's
 * FlightServiceModel: whether the gateway has Flight Service connected,
 * the reference each flight's filed form came back with, and each
 * failure said where it happened -- a status that could not be asked is
 * said, never read as "not connected".
 */
@HiltViewModel
class FilingModel @Inject constructor() : ViewModel() {
    data class State(
        val status: FlightServiceStatus? = null,
        val statusProblem: String? = null,
        /** Flight Service's reference by the flight's place in the route. */
        val filed: Map<Int, String> = emptyMap(),
        val sending: Int? = null,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun load() {
        viewModelScope.launch {
            try {
                val status = Gateway.flightService()
                _state.update { it.copy(status = status, statusProblem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(statusProblem = "Whether filing is connected here couldn't be checked: ${e.message}") }
            }
        }
    }

    fun file(flight: Int, request: FlightPlanFilingRequest) {
        if (_state.value.sending != null) return
        _state.update { it.copy(sending = flight, problem = null) }
        viewModelScope.launch {
            try {
                val reference = Gateway.file(request)
                _state.update { it.copy(filed = it.filed + (flight to reference), sending = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(sending = null, problem = "Not filed: ${e.message}") }
            }
        }
    }
}
