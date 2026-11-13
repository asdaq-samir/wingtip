package app.wingtipmaps.android.dryrun

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.ForecastRunAsk
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.pilot.MinimumsStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject
import app.wingtipmaps.android.api.generated.ForecastRun as RunAnswer

/**
 * The dry run played against the forecast (the owner, 2026-11-09), the
 * view model of the dry run's forecast strip, as the web's
 * useForecastRun: with forecast mode on, the run sent to the planner once
 * (POST /api/forecast/run, the engine's forecast_run) -- flown from the
 * plan's departure time, so "leave at 14:00" meets 14:00's forecast and
 * on -- and the answer kept, which the strip and the map read at the
 * run's time as it plays (ForecastPlay). A new run is asked again.
 */
@HiltViewModel
class ForecastRun @Inject constructor(app: Application) : AndroidViewModel(app) {
    data class State(
        val on: Boolean = false,
        val loading: Boolean = false,
        val problem: String? = null,
        val answer: RunAnswer? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asked: DryRunPath? = null
    private var asking: Job? = null

    /** Forecast mode on, or off with what was asked dropped. */
    fun toggle() {
        if (_state.value.on) {
            asking?.cancel()
            asked = null
            _state.value = State()
        } else {
            _state.update { it.copy(on = true) }
        }
    }

    /** The run now open (or none) and the plan's flight rules: asked for
     *  once with forecast mode on, again only for a new run. */
    fun follow(path: DryRunPath?, rules: String) {
        if (path == null) {
            // The run closed: forecast mode ends with it.
            asking?.cancel()
            asked = null
            _state.value = State()
            return
        }
        if (!_state.value.on) return
        if (path === asked) return
        asked = path
        asking?.cancel()
        _state.update { it.copy(loading = true, problem = null, answer = null) }
        val minimums = MinimumsStore.of(getApplication()).minimums.value
        asking = viewModelScope.launch {
            try {
                val answer = ForecastPlanner.run(ForecastPlay.ask(path, rules, minimums))
                _state.update { it.copy(loading = false, answer = answer) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                asked = null
                _state.update { it.copy(loading = false, problem = Problems.say("The forecast couldn't be fetched", e)) }
            }
        }
    }
}

/** The planner's forecast run (POST /api/forecast/run): public, as the
 *  map's other weather is, and posted as the clearance's places are. */
object ForecastPlanner {
    suspend fun run(ask: ForecastRunAsk): RunAnswer = Planner.writes.forecastDryRun(ask).planned()
}
