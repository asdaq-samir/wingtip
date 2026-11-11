package app.wingtipmaps.android.navigation

import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ui.SheetPage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A thing's card or a page asked for from somewhere other than the map
 * or a link -- a route point's More Info, an alert's field or airspace,
 * the strip's checkpoint, its clearance chip -- and opened by the root on
 * the sheet's stack as a tap on the map would open it (SheetNav.open: on
 * top of a card already open, else the one card), so "tap what you see"
 * has one way in, as ScreenRequests is for the screens of
 * design/screens.json.
 */
object CardRequests {
    private val _wanted = MutableStateFlow<SheetPage?>(null)
    val wanted: StateFlow<SheetPage?> = _wanted.asStateFlow()

    fun open(pick: MapPick) = open(SheetPage.of(pick))

    fun open(page: SheetPage) {
        _wanted.value = page
    }

    /** The card asked for, and none left. */
    fun take(): SheetPage? {
        val now = _wanted.value ?: return null
        _wanted.value = null
        return now
    }
}
