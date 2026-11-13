package app.wingtipmaps.android.search

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R

/**
 * The one search opened from outside its bar: by an Airport link (what
 * was the Airport tab), the plan's Add a Stop, or a route point's Add a
 * Stop After (the card rule, 2026-11-10: one search field, no field of
 * its own), where a field or a fix picked goes into the route as a stop
 * rather than opening its card; or the first flight's route after the
 * welcome, where an airport picked is handed back to the asker.
 * Back to finding once the search closes.
 */
@Stable
class SearchControl {
    /** Counts the asks to open the search, each one opening it. */
    var asked by mutableIntStateOf(0)
        private set

    /** What a field or fix picked does: a stop in the route, not its card. */
    var addingStop by mutableStateOf(false)
        private set

    /** The point of the route the stop goes after; null for the last stop,
     *  just before the destination. */
    var stopAfter by mutableStateOf<String?>(null)
        private set

    /** An airport field opened the search (the first flight's): an
     *  airport picked is handed to it, its card not opened. */
    var picking by mutableStateOf<((String) -> Unit)?>(null)
        private set

    /** What the bar asks while it picks an airport ("Where to?"). */
    @get:StringRes
    var pickHint by mutableIntStateOf(0)
        private set

    // The asks a search bar has opened for, so a bar composed again (Home
    // and the plan each carry the row on the sheet's stack) does not open
    // for an ask already taken.
    private var taken = 0

    /** Whether there is an ask not yet opened for; it is taken. */
    fun takeAsk(): Boolean {
        if (asked <= taken) return false
        taken = asked
        return true
    }

    fun open() {
        done()
        asked++
    }

    /** The one search opened for an airport field (card rule 5: the
     *  airport picker is the main search, never a field of its own). */
    fun pickAirport(@StringRes hint: Int, onPicked: (String) -> Unit) {
        done()
        picking = onPicked
        pickHint = hint
        asked++
    }

    /** An end of `plan`'s route not given yet, asked for (the web's
     *  688305a42: half a route asks for its departure where it can):
     *  picked, the route is planned with it; with neither end, the search
     *  opens. */
    fun askRouteEnd(plan: Plan) {
        val s = plan.state.value
        when {
            s.dep.isEmpty() && s.dest.isNotEmpty() -> pickAirport(R.string.where_from) { plan.plan(it, s.dest, s.stops) }
            s.dest.isEmpty() && s.dep.isNotEmpty() -> pickAirport(R.string.where_to) { plan.plan(s.dep, it, s.stops) }
            else -> open()
        }
    }

    fun addStop() {
        done()
        addingStop = true
        stopAfter = null
        asked++
    }

    fun addStopAfter(point: String) {
        done()
        addingStop = true
        stopAfter = point
        asked++
    }

    fun done() {
        addingStop = false
        stopAfter = null
        picking = null
    }
}

@Composable
fun rememberSearchControl(): SearchControl = remember { SearchControl() }
