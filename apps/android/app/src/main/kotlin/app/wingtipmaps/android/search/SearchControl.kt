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
 * was the Airport tab) or the plan's Add a Stop, where a field or a fix
 * picked goes into the route as a stop rather than opening its card.
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

    fun open() {
        addingStop = false
        asked++
    }

    fun addStop() {
        addingStop = true
        asked++
    }

    fun done() {
        addingStop = false
    }
}

@Composable
fun rememberSearchControl(): SearchControl = remember { SearchControl() }
