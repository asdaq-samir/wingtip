package app.wingtipmaps.android.brief

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.departureWindow
import app.wingtipmaps.android.api.generated.DepartureWindow
import app.wingtipmaps.android.api.generated.DepartureWindowAsk
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * "When should I go?"'s view model (the web's useDepartureWindow): the
 * planner's answer for the route with the airplane picked (POST
 * /api/departure-window, the engine's departure_window over the Go /
 * No-Go's own findings for a flight leaving each hour), and the hour the
 * pilot tapped. No airplane: asked without one, and the hours judge the
 * weather, the airspace and the daylight alone. Signed in only: it is the
 * planner's heaviest ask. Kept ten minutes for a route.
 */
class DepartureWindowModel(
    private val ask: suspend (DepartureWindowAsk) -> DepartureWindow = { Planner.departureWindow(it) },
    private val now: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    data class State(
        val route: String? = null,
        val answer: DepartureWindow? = null,
        val airplane: Boolean = false,
        val pending: Boolean = false,
        val problem: String? = null,
        val picked: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null
    private var askedAtMs = 0L

    fun ask(plan: Plan.State, signedIn: Boolean) {
        if (!plan.routed || !signedIn || plan.dep == plan.dest && plan.stops.isEmpty()) {
            asking?.cancel()
            _state.value = State()
            return
        }
        val route = listOf(plan.dep, plan.stops.joinToString(","), plan.dest, plan.aircraft).joinToString("|")
        val s = _state.value
        if (route == s.route && (s.pending || now() - askedAtMs < KEPT_MS)) return
        asking?.cancel()
        askedAtMs = now()
        _state.value = State(route = route, airplane = plan.airplane, pending = true)
        asking = viewModelScope.launch {
            val question = DepartureWindowAsk(
                dep = plan.dep, dest = plan.dest, stops = plan.stops.joinToString(",").ifEmpty { null },
                aircraft = plan.aircraft.ifEmpty { Planner.NO_AIRPLANE }, airplane = plan.airplane,
                hours = HOURS, day = LocalDate.now().toString(),
            )
            try {
                val answer = ask(question)
                _state.update { it.copy(answer = answer, pending = false, problem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(pending = false, problem = "Hours unavailable: ${e.message ?: "the planner did not answer"}") }
            }
        }
    }

    /** An hour tapped, or tapped again to put it away. */
    fun pick(depart: String) = _state.update { it.copy(picked = if (it.picked == depart) null else depart) }

    companion object {
        const val KEPT_MS = 10 * 60_000L

        /** A day and a half and more: as far as the TAFs reach. */
        const val HOURS = 48
    }
}
