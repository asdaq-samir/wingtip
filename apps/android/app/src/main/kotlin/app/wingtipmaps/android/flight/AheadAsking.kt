package app.wingtipmaps.android.flight

import android.content.Context
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.ahead
import app.wingtipmaps.android.engine.CyclePacks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What is ahead of own ship on its track: the planner's answer
 *  (/api/airspace/ahead), or the packs on the phone's where it cannot be
 *  reached (CyclePacks.ahead), with the ground under the airplane. */
class AheadAsking(private val context: Context, private val scope: CoroutineScope) {
    /** What the track runs into in the next minutes, from the planner or
     *  the packs. */
    private val _ahead = MutableStateFlow<List<AheadAlert>>(emptyList())
    val ahead: StateFlow<List<AheadAlert>> = _ahead.asStateFlow()

    /** The ground under the airplane from the packs kept on the phone,
     *  asked with what is ahead: the glide ring's ground (InFlight). */
    private val _groundFt = MutableStateFlow<Double?>(null)
    val groundFt: StateFlow<Double?> = _groundFt.asStateFlow()

    private var asking: Job? = null

    /** What is ahead, asked of the latest fix (every ten seconds while the
     *  airplane is at flying speed, OwnShip's Ticker): the planner looks
     *  five minutes along the track (wingtip.alerts). Flying speed is the
     *  engine's `underway`, the speed the engine's own look ahead starts
     *  at, so a taxiing airplane asks nothing it would not answer. The
     *  asking is a job of its own, so the next question cancels one still
     *  unanswered. */
    fun ask(fix: OwnShip.Fix?, routeLine: List<List<Double>>?) {
        fix ?: return
        val track = fix.trackDeg ?: return
        val gs = fix.groundspeedKt ?: return
        // Where the engine cannot say, what is ahead is asked anyway: an
        // alert asked for nothing costs less than one missed.
        if (!OwnShip.underway(gs).getOrDefault(true)) return
        asking?.cancel()
        asking = scope.launch {
            // The packs' answer is asked either way, for the ground under
            // the airplane the glide ring stands on, network or none: off
            // the main thread, as the engine reads nine regions' packs.
            val offline = withContext(Dispatchers.Default) { CyclePacks.of(context).ahead(fix.lat, fix.lon, track, gs, fix.altitudeFt, routeLine) }
            _groundFt.value = offline?.groundFt
            val alerts = try {
                Planner.ahead(fix.lat, fix.lon, track, gs, fix.altitudeFt)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No planner in the air: the same alerts from the packs
                // kept for the route (CyclePacks.ahead).
                offline?.alerts ?: return@launch
            }
            _ahead.value = alerts
        }
    }

    /** The question still unanswered dropped: the reading stopped. */
    fun cancel() {
        asking?.cancel()
    }
}
