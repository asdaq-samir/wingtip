package app.wingtipmaps.android.airplane

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.PastFlightPoint
import app.wingtipmaps.android.api.pastFlight
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * A past flight played on the map from its row on the airplane's card (the
 * owner, 2026-11-14: "How do I see the flights of airplane and play
 * them?"): its points as heard, the airplane drawn where it was at each
 * moment and the path flown behind it, at 60 times as flown, with Pause
 * and ✕ in a bar over the map. One at a time, the map's (MapPane).
 */
object PastFlightReplay {
    data class State(
        val name: String? = null,
        val points: List<PastFlightPoint> = emptyList(),
        val flownS: Double = 0.0,
        val playing: Boolean = false,
        val loading: Boolean = false,
        val problem: String? = null,
    ) {
        val open: Boolean get() = name != null
        private val startT: Double get() = points.firstOrNull()?.t ?: 0.0
        val totalS: Double get() = (points.lastOrNull()?.t ?: 0.0) - startT

        /** The airplane at the replay's moment, as the map draws own ship. */
        val fix: OwnShip.Fix?
            get() {
                if (points.size < 2) return null
                val t = startT + flownS
                val i = points.indexOfLast { it.t <= t }.coerceIn(0, points.lastIndex - 1)
                val a = points[i]
                val b = points[i + 1]
                val f = if (b.t > a.t) ((t - a.t) / (b.t - a.t)).coerceIn(0.0, 1.0) else 0.0
                val alt = if (a.altFt != null && b.altFt != null) a.altFt + (b.altFt - a.altFt) * f else a.altFt
                return OwnShip.Fix(
                    lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f, altitudeFt = alt,
                    trackDeg = a.trackDeg, groundspeedKt = a.gsKt, accuracyM = 0.0, atMs = (t * 1000).toLong(),
                )
            }

        /** The path flown so far, for the map's trail. */
        val flown: List<PathPoint>
            get() = points.takeWhile { it.t <= startT + flownS }.map { PathPoint(t = it.t, lat = it.lat, lon = it.lon, altFt = it.altFt) }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var ticking: Job? = null

    /** The flight `id` of the airplane at `hex` fetched and played. */
    fun play(hex: String, id: Int, name: String) {
        ticking?.cancel()
        _state.value = State(name = name, loading = true)
        ticking = scope.launch {
            try {
                val points = Planner.pastFlight(hex, id).points.sortedBy { it.t }
                _state.value = State(name = name, points = points, playing = points.size >= 2)
                run()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, problem = Problems.say("The flight couldn't be fetched", e)) }
            }
        }
    }

    private suspend fun run() {
        while (_state.value.playing) {
            delay(TICK_MS)
            _state.update {
                val flown = minOf(it.totalS, it.flownS + TICK_MS / 1000.0 * SPEED)
                it.copy(flownS = flown, playing = flown < it.totalS)
            }
        }
    }

    fun toggle() {
        val s = _state.value
        if (s.playing) {
            ticking?.cancel()
            _state.update { it.copy(playing = false) }
        } else if (s.points.size >= 2) {
            _state.update { it.copy(playing = true, flownS = if (it.flownS >= it.totalS) 0.0 else it.flownS) }
            ticking = scope.launch { run() }
        }
    }

    fun close() {
        ticking?.cancel()
        _state.value = State()
    }

    /** How many times faster than flown; a 1-hour flight in a minute. */
    private const val SPEED = 60
    private const val TICK_MS = 250L
}

/** The replay's bar over the map: the flight's name, how far it has
 *  played, its altitude and groundspeed now, Play or Pause, and ✕. */
@Composable
fun PastFlightReplayBar(modifier: Modifier = Modifier) {
    val run by PastFlightReplay.state.collectAsStateWithLifecycle()
    if (!run.open) return
    Surface(modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg), shape = MaterialTheme.shapes.large, tonalElevation = WingtipSpace.Xs) {
        androidx.compose.foundation.layout.Column(Modifier.padding(WingtipSpace.Sm)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                IconButton(onClick = PastFlightReplay::toggle, enabled = run.points.size >= 2) {
                    Icon(
                        if (run.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = stringResource(if (run.playing) R.string.replay_pause else R.string.replay_play),
                    )
                }
                val fix = run.fix
                val now = listOfNotNull(fix?.altitudeFt?.let(Format::reportedAltitude), fix?.groundspeedKt?.let(Format::speed)).joinToString(" · ")
                Text(listOfNotNull(run.name, now.ifEmpty { null }).joinToString(" · "), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconButton(onClick = PastFlightReplay::close) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.close)) }
            }
            if (run.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            else if (run.totalS > 0) LinearProgressIndicator(progress = { (run.flownS / run.totalS).toFloat() }, modifier = Modifier.fillMaxWidth())
            ProblemLine(run.problem)
        }
    }
}
