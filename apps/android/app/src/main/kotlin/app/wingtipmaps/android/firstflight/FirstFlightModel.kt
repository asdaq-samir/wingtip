package app.wingtipmaps.android.firstflight

import android.Manifest
import android.app.Application
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.nearest
import app.wingtipmaps.android.flight.FlightSession
import app.wingtipmaps.android.plan.FlightChoices
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

/**
 * The first route's one model, after the welcome (the web's
 * useFirstFlight): the destination the one search picked, a departure
 * where one has to be asked, and the plan.
 *
 * It plans to the destination from where the pilot is -- own ship's fix,
 * else the phone's position read once, the nearest field to it (the
 * planner's nearest) -- else from the pilot's home airport (HomeAirport);
 * with neither, it asks where from (`needsFrom`), and a destination that
 * is where the pilot is, where to again (`same`). Then the route is
 * planned as the plan's own fields plan one, `planned` says so (the FPL
 * tip, FplTip) and `onPlanned` brings the FPL up.
 */
@HiltViewModel
class FirstFlightModel @Inject constructor(app: Application, private val flight: FlightSession) : AndroidViewModel(app) {
    data class State(
        val dest: String? = null,
        val from: String? = null,
        /** No position and no home airport: the card asks where from. */
        val needsFrom: Boolean = false,
        val planning: Boolean = false,
        val problem: String? = null,
        /** The destination was where the pilot is: asked again. */
        val same: Boolean = false,
    ) {
        val ready: Boolean get() = dest != null && (!needsFrom || from != null) && !planning
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private val _planned = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** Each first route planned. */
    val planned: SharedFlow<Unit> = _planned.asSharedFlow()

    fun pickDest(ident: String) = _state.update { it.copy(dest = ident.uppercase(), problem = null, same = false) }

    fun pickFrom(ident: String) = _state.update { it.copy(from = ident.uppercase(), problem = null) }

    fun planIt(plan: Plan, onPlanned: () -> Unit) {
        val dest = _state.value.dest ?: return
        _state.update { it.copy(planning = true, problem = null) }
        viewModelScope.launch {
            try {
                val dep = _state.value.from ?: nearestToPilot() ?: FlightChoices.of(getApplication()).home.value
                when {
                    // No position and nothing kept: the card asks where from.
                    dep == null -> _state.update { it.copy(needsFrom = true) }
                    dep.equals(dest, ignoreCase = true) ->
                        _state.update { it.copy(problem = getApplication<Application>().getString(R.string.first_flight_same, dest), same = true) }
                    else -> {
                        plan.plan(dep, dest, emptyList())
                        _state.value = State()
                        _planned.tryEmit(Unit)
                        onPlanned()
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = Problems.say(getApplication<Application>().getString(R.string.first_flight_unreached), e)) }
            } finally {
                _state.update { it.copy(planning = false) }
            }
        }
    }

    /** The field nearest the pilot, by the planner, or null where the phone
     *  has no position for it. */
    private suspend fun nearestToPilot(): String? {
        val (lat, lon) = located() ?: return null
        return Planner.nearest(lat, lon, limit = 1).firstOrNull()?.ident
    }

    /** Own ship's fix where it is on, else the phone's position read once
     *  (the fused provider's current location, a few seconds at most), or
     *  null without the permission, which the welcome asks for at its tap. */
    private suspend fun located(): Pair<Double, Double>? {
        flight.ownShip.fix.value?.let { return it.lat to it.lon }
        val app = getApplication<Application>()
        // Checked here, beside the call it guards, as lint's MissingPermission reads it.
        val allowed = ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!allowed) return null
        val cancel = CancellationTokenSource()
        return try {
            withTimeoutOrNull(LOCATE_MS) {
                LocationServices.getFusedLocationProviderClient(app)
                    .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancel.token)
                    .await()
            }?.let { it.latitude to it.longitude }
        } catch (e: SecurityException) {
            null
        } finally {
            cancel.cancel()
        }
    }

    private companion object {
        /** How long Plan It waits on the phone's position: the web's four seconds. */
        const val LOCATE_MS = 4_000L
    }
}
