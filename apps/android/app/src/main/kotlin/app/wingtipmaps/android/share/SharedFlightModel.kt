package app.wingtipmaps.android.share

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.gateway.FlightCheckpointDto
import app.wingtipmaps.android.api.generated.gateway.SharedFlightDto
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.FlightRules
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/**
 * The Shared Flight sheet's state (design/screens.json `shared`): a flight
 * another pilot sent, shown before anything of the receiver's changes.
 * A plain link's plan is shown at once; a saved flight's share is read
 * from the gateway (GET /api/shared-flights/{token}, signed in or not),
 * with its filed nav log. Use This Plan plans it as the receiver's own,
 * with their own airplane; Not Now leaves their plan as it was.
 */
@HiltViewModel
class SharedFlightModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    /** What the sheet shows. */
    sealed interface State {
        data object Closed : State

        data object Reading : State

        /** The plan, and for a saved flight its filed nav log and totals. */
        data class Shown(val plan: SharedPlan, val navLog: List<FlightCheckpointDto> = emptyList(), val totals: Totals? = null) : State

        /** The pilot stopped sharing it, or the link was never one. */
        data object Gone : State

        /** It could not be read: no signal, the server down. */
        data class Problem(val words: String) : State
    }

    data class Totals(val distanceNm: Double?, val eteMin: Double?, val fuelGal: Double?)

    private val _state = MutableStateFlow<State>(State.Closed)
    val state: StateFlow<State> = _state.asStateFlow()

    private var reading: Job? = null

    /** A shared link opened. */
    fun open(link: Links.Shared) {
        reading?.cancel()
        link.plan?.let {
            _state.value = State.Shown(it)
            return
        }
        val token = link.token ?: return
        _state.value = State.Reading
        reading = viewModelScope.launch {
            _state.value = try {
                Gateway.api.shared(token).readOrNone(none = setOf(404))?.let(::shown) ?: State.Gone
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                State.Problem(Problems.say("The flight could not be read", e))
            }
        }
    }

    /** Not Now, or the sheet closed: nothing of the receiver's changes. */
    fun close() {
        reading?.cancel()
        _state.value = State.Closed
    }

    /** Use This Plan: the route planned as the receiver's own -- its
     *  altitude, its departure time while still ahead, its flight rules --
     *  on their own airplane, then its nav log (the plan's legs). */
    fun use(plan: Plan) {
        val shown = _state.value as? State.Shown ?: return
        val p = shown.plan
        p.rules?.let { FlightChoices.of(getApplication()).setRules(FlightRules.of(it)) }
        val depart = p.depart?.takeIf { runCatching { Instant.parse(it).isAfter(AppClock.javaNow()) }.getOrDefault(false) }
        plan.useLeg(p.dep, p.dest, p.stops, p.altitudeFt?.toDouble(), depart)
        ScreenRequests.ask(Screen.NAVLOG)
        _state.value = State.Closed
    }

    private fun shown(f: SharedFlightDto): State.Shown = State.Shown(
        plan = SharedPlan(
            dep = f.departureIdent,
            dest = f.destinationIdent,
            stops = f.stops,
            altitudeFt = f.cruiseAltitudeFt,
            depart = f.plannedFor,
            type = f.aircraftType,
            tail = f.aircraftTailNumber,
        ),
        navLog = f.checkpoints,
        totals = Totals(f.totalDistanceNm, f.totalEteMin, f.totalFuelGal),
    )
}
