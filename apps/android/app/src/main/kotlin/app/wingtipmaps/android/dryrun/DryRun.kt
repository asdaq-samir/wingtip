package app.wingtipmaps.android.dryrun

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.dryRun
import app.wingtipmaps.android.flight.OwnShip
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject

/**
 * The route flown on the ground, as the web's and the iPhone's dry runs
 * fly it: the engine's `dry_run` flies the plan on paper once -- each leg
 * in its own time on its true course at its ground speed, along the
 * course line the map draws, at the heights of the plan's profile -- from
 * the plan's departure time (now where none is set), and the airplane is
 * moved along it faster than real time. It flies on from a stop at once
 * (the owner, 2026-10-28). It needs what the nav log needs and no more:
 * with no airplane picked it flies the legs the log has, none assumed.
 * Own ship's own position is left alone; the map draws this one in its
 * place while the run is open.
 */
@HiltViewModel
class DryRun @Inject constructor() : ViewModel() {
    data class State(
        val path: DryRunPath? = null,
        /** Seconds flown since the run's start. */
        val flownS: Double = 0.0,
        /** How many times faster than flown (SPEEDS). */
        val speed: Int = SPEEDS.first(),
        val playing: Boolean = false,
        /** Why the engine could not fly the plan, in its words. */
        val problem: String? = null,
    ) {
        val open: Boolean get() = path != null
        /** The run's time now, s since 1970. */
        val t: Double get() = (path?.startT ?: 0.0) + flownS
        val done: Boolean get() = path != null && flownS >= path.totalS
        val fix: OwnShip.Fix? get() = path?.fixAt(t)
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var ticking: Job? = null

    /** The plan flown from its departure time, or now; nothing but a
     *  problem where its rows cannot be laid out from the legs it has. */
    fun start(plan: Plan.State) {
        val course = plan.course ?: return
        val rows = DryRunRows.of(course, plan.legs)
        if (rows == null) {
            _state.update { it.copy(problem = NOT_YET) }
            return
        }
        val startS = (Plan.departMs(plan.depart) ?: System.currentTimeMillis()) / 1000.0
        val line = course.courseLine.map { p -> p.map { JsonPrimitive(it) } }
        viewModelScope.launch {
            val answer = withContext(Dispatchers.Default) { Engine.dryRun(rows, startS, line) }
            answer.fold(
                { run ->
                    if (run.points.size < 2) {
                        _state.update { State(problem = NOT_YET) }
                    } else {
                        _state.value = State(path = DryRunPath(run, course, DryRunRows.heights(rows)), speed = _state.value.speed)
                        play()
                    }
                },
                { e ->
                    _state.update { it.copy(problem = "The dry run couldn't be flown: ${e.message}") }
                },
            )
        }
    }

    fun play() {
        val s = _state.value
        if (s.path == null) return
        // Played again from the start once it is in.
        if (s.done) _state.update { it.copy(flownS = 0.0) }
        _state.update { it.copy(playing = true) }
        ticking?.cancel()
        ticking = viewModelScope.launch {
            while (_state.value.playing) {
                delay(TICK_MS)
                _state.update {
                    val total = it.path?.totalS ?: 0.0
                    val flown = minOf(total, it.flownS + TICK_MS / 1000.0 * it.speed)
                    it.copy(flownS = flown, playing = it.playing && flown < total)
                }
            }
        }
    }

    fun pause() {
        ticking?.cancel()
        _state.update { it.copy(playing = false) }
    }

    fun speed(times: Int) = _state.update { it.copy(speed = times) }

    /** The run closed: the map is own ship's again. */
    fun close() {
        ticking?.cancel()
        _state.value = State(speed = _state.value.speed)
    }

    companion object {
        /** The speeds the run plays at, times real time. */
        val SPEEDS = listOf(10, 50, 200)
        /** How often the airplane is moved: four times a second. */
        const val TICK_MS = 250L
        private const val NOT_YET = "The dry run needs the whole nav log; plan the route again."
    }
}
