package app.wingtipmaps.android.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A screen in a sheet of its own over the map and the docked sheet, its
 * title and its close going back to where it was opened from (decision
 * 0015): the airplane's page, the account menu's pages, Ask,
 * and the clearance card. OverSheet draws each.
 */
sealed interface Over {
    data object Airplane : Over

    /** Settings and the account: the account menu's Settings. */
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
 *  link open it the one way. */
object OverRequests {
    private val _shown = MutableStateFlow<Over?>(null)
    val shown: StateFlow<Over?> = _shown.asStateFlow()

    fun open(over: Over?) {
        _shown.value = over
    }

    fun close() {
        _shown.value = null
    }
}
