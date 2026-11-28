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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.PastFlightPoint
import app.wingtipmaps.android.api.pastFlight
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.ReportEnd
import app.wingtipmaps.android.flight.fixBetween
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * A past flight played on the map from its row on the airplane's card (the
 * owner, 2026-11-14: "How do I see the flights of airplane and play
 * them?"): its points as the planner made them ready (its replay_track:
 * the heights smoothed, the climb as a VSI reads it, a hole of no report
 * said as a gap, a stale height held at the last good one, none on the
 * ground), played as sent and never worked out again here: the airplane
 * drawn where it was at each moment, never moved along a line across a
 * gap, never drawn at a height it was not sent (no 0 ft), and the path
 * flown behind it, at 60 times as flown, with its height, climb and speed,
 * Pause and ✕ in a bar over the map. One at a time, the map's (MapPane).
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

        /** The report the replay's moment is after. */
        private val at: Int get() = points.indexOfLast { it.t <= startT + flownS }.coerceIn(0, maxOf(0, points.lastIndex - 1))

        /** The airplane at the replay's moment, as the map draws own ship. */
        val fix: OwnShip.Fix? get() = between(points, at, startT + flownS)

        /** Its climb at that moment, the planner's VSI-like rate, ft/min; null where none. */
        val climbFpm: Double? get() = points.getOrNull(at)?.takeIf { it.ground != true }?.vsFpm

        /** Its height there the last good one carried (a stale or missing report's). */
        val heightHeld: Boolean get() = points.getOrNull(at)?.altHeld == true

        /** The path flown so far, for the map's trail. */
        val flown: List<PathPoint>
            get() = points.takeWhile { it.t <= startT + flownS }.map { PathPoint(t = it.t, lat = it.lat, lon = it.lon, altFt = it.altFt) }
    }

    /** Made at the first play, not as the object loads: Dispatchers.Main
     *  is Android's, and a plain JVM (the unit tests of between and
     *  climbWords) has none, so asking it at class load failed the class. */
    private val scope by lazy { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }
    /** Compose's own state, so the map and the bar read it where they
     *  draw, with no state of their own (MapPane holds none for it). */
    var state by mutableStateOf(State())
        private set
    private var ticking: Job? = null

    /** The path the map draws: the replay's while one is open, else `own`. */
    fun trailOr(own: List<PathPoint>): List<PathPoint> = state.let { if (it.open) it.flown else own }

    /** The flight `id` of the airplane at `hex` fetched and played. */
    fun play(hex: String, id: Int, name: String) {
        ticking?.cancel()
        state = State(name = name, loading = true)
        ticking = scope.launch {
            try {
                val points = Planner.pastFlight(hex, id).points.sortedBy { it.t }
                state = State(name = name, points = points, playing = points.size >= 2)
                run()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                state = state.copy(loading = false, problem = Problems.say("The flight could not be fetched", e))
            }
        }
    }

    private suspend fun run() {
        while (state.playing) {
            delay(TICK_MS)
            val flown = minOf(state.totalS, state.flownS + TICK_MS / 1000.0 * SPEED)
            state = state.copy(flownS = flown, playing = flown < state.totalS)
        }
    }

    fun toggle() {
        val s = state
        if (s.playing) {
            ticking?.cancel()
            state = state.copy(playing = false)
        } else if (s.points.size >= 2) {
            state = state.copy(playing = true, flownS = if (state.flownS >= state.totalS) 0.0 else state.flownS)
            ticking = scope.launch { run() }
        }
    }

    fun close() {
        ticking?.cancel()
        state = State()
    }

    /**
     * The airplane `t` s after 1970, between the reports `i` and `i + 1`:
     * moved in proportion between them, its height too where both have
     * one; held at `i` until a report after a gap (nothing known across a
     * hole); on the ground, no height. Null with fewer than two reports.
     */
    fun between(points: List<PastFlightPoint>, i: Int, t: Double): OwnShip.Fix? {
        if (points.size < 2) return null
        val a = points[i]
        val b = points[i + 1]
        val f = if (b.gap == true || b.t <= a.t) 0.0 else ((t - a.t) / (b.t - a.t)).coerceIn(0.0, 1.0)
        return fixBetween(a.end(), b.end(), f, t, heights = a.ground != true)
    }

    /** "↑ 600 fpm", "↓ 300 fpm" or "level" under 100 ft/min, to the 50 ft/min. */
    fun climbWords(fpm: Double?): String? = fpm?.let {
        if (abs(it) < LEVEL_FPM) "level" else String.format(Locale.US, "%s %,d fpm", if (it > 0) "↑" else "↓", (abs(it) / 50).roundToLong() * 50)
    }

    /** Under this, ft/min, the replay says level, as the traffic card does. */
    private const val LEVEL_FPM = 100.0

    /** How many times faster than flown; a 1-hour flight in a minute. */
    private const val SPEED = 60
    private const val TICK_MS = 250L
}

/** The replay's bar over the map: the flight's name, how far it has
 *  played, its altitude and groundspeed now, Play or Pause, and ✕. */
@Composable
fun PastFlightReplayBar(modifier: Modifier = Modifier) {
    val run = PastFlightReplay.state
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
                // A height held at the last good one says so, so it is not read as sent.
                val height = fix?.altitudeFt?.let(Format::reportedAltitude)?.let { if (run.heightHeld) stringResource(R.string.replay_height_held, it) else it }
                val now = listOfNotNull(height, PastFlightReplay.climbWords(run.climbFpm), fix?.groundspeedKt?.let(Format::speed)).joinToString(" · ")
                Text(listOfNotNull(run.name, now.ifEmpty { null }).joinToString(" · "), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                IconButton(onClick = PastFlightReplay::close) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.close)) }
            }
            if (run.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            else if (run.totalS > 0) LinearProgressIndicator(progress = { (run.flownS / run.totalS).toFloat() }, modifier = Modifier.fillMaxWidth())
            ProblemLine(run.problem)
        }
    }
}

private fun PastFlightPoint.end() = ReportEnd(lat, lon, altFt, trackDeg, gsKt)
