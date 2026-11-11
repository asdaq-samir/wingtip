package app.wingtipmaps.android.search

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

/**
 * The one search opened from outside its bar: by an Airport link (what
 * was the Airport tab), the plan's Add a Stop, or a route point's Add a
 * Stop After (the card rule, 2026-11-10: one search field, no field of
 * its own), where a field or a fix picked goes into the route as a stop
 * rather than opening its card. Back to finding once the search closes.
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
        addingStop = false
        stopAfter = null
        asked++
    }

    fun addStop() {
        addingStop = true
        stopAfter = null
        asked++
    }

    fun addStopAfter(point: String) {
        addingStop = true
        stopAfter = point
        asked++
    }

    fun done() {
        addingStop = false
        stopAfter = null
    }
}

@Composable
fun rememberSearchControl(): SearchControl = remember { SearchControl() }
