package app.wingtipmaps.android.navigation

import app.wingtipmaps.android.map.MapPick
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * A thing's card asked for from somewhere other than the map -- a route
 * point's More Info, an alert's field or airspace -- and opened by the
 * root as a tap on the map would open it (RootScreen's onPick: a field in
 * the Airport tab, the rest over the map), so "tap what you see" has one
 * way in, as ScreenRequests is for screens.
 */
object CardRequests {
    private val _wanted = MutableStateFlow<MapPick?>(null)
    val wanted: StateFlow<MapPick?> = _wanted.asStateFlow()

    fun open(pick: MapPick) {
        _wanted.value = pick
    }

    /** The card asked for, and none left. */
    fun take(): MapPick? {
        val now = _wanted.value ?: return null
        _wanted.value = null
        return now
    }
}
