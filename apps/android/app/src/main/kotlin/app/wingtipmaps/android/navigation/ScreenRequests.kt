package app.wingtipmaps.android.navigation

import app.wingtipmaps.android.navigation.generated.Screen
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A screen asked for by its name (design/screens.json) and not yet open:
 * the one way in for a link, a figure tapped and the app's own shortcuts.
 * RootScreen says which tab it is on (openScreen); the screen that holds
 * its page -- Setup's Logbook, the Airplane tab's checklist -- takes it
 * from here, as only it can open its own sheets.
 */
object ScreenRequests {
    private val _wanted = MutableStateFlow<Screen?>(null)
    val wanted: StateFlow<Screen?> = _wanted.asStateFlow()

    fun ask(screen: Screen) {
        _wanted.value = screen
    }

    /** The screen asked for, when it is one of [these], and none left. */
    fun take(these: Set<Screen>): Screen? {
        val now = _wanted.value ?: return null
        if (now !in these) return null
        _wanted.value = null
        return now
    }
}
