package app.wingtipmaps.android.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A screen in a sheet of its own over the map and the docked sheet, its
 * title and its close going back to where it was opened from (decision
 * 0015): the airplane's page, Settings and its pages, Ask,
 * and the clearance card. OverSheet draws each.
 */
sealed interface Over {
    data object Airplane : Over

    /** Settings and the account: the account button's page. */
    data object Settings : Over

    data object Logbook : Over

    data object Downloads : Over

    data object Passengers : Over

    data object About : Over

    data object Ask : Over

    data object Clearance : Over
}

/** The one sheet over the map now, opened by a screen asked for by its
 *  name (RootScreen) or a row that opens one, so both layouts and every
 *  link open it the one way. A sheet opened over another -- Settings'
 *  Logbook, Downloads or About -- closes back to it, one level at a time
 *  (decision 0015: close goes back to where it was opened from). */
object OverRequests {
    private val _shown = MutableStateFlow<Over?>(null)
    val shown: StateFlow<Over?> = _shown.asStateFlow()

    /** The sheets under the one shown, the nearest last. */
    private val under = ArrayDeque<Over>()

    fun open(over: Over?) {
        val now = _shown.value
        if (over == null) {
            closeAll()
            return
        }
        if (now != null && now != over) under.addLast(now)
        _shown.value = over
    }

    /** Back one level: to the sheet this one was opened over, or the map. */
    fun close() {
        _shown.value = under.removeLastOrNull()
    }

    /** Every sheet closed, back to the map. */
    fun closeAll() {
        under.clear()
        _shown.value = null
    }
}
