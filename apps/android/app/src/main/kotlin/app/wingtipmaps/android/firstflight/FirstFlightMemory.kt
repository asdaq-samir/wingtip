package app.wingtipmaps.android.firstflight

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the first flight's card has been done with on this install:
 * planned or put away with Not Now, it is not offered again until Setup's
 * Show First Flight Again resets it (the web's FIRST_FLIGHT tip). Kept in
 * the app's own "wingtip" store (Kept) beside the layout, and held in one
 * StateFlow so the root, which shows the card, and Setup, which resets it,
 * see the same value the moment it changes. The reading and writing are
 * handed in, so the tests keep it in memory.
 */
class FirstFlightMemory(read: () -> Boolean, private val write: (Boolean) -> Unit) {
    private val _seen = MutableStateFlow(read())
    val seen: StateFlow<Boolean> = _seen.asStateFlow()

    fun markSeen() {
        write(true)
        _seen.value = true
    }

    /** Setup's Show First Flight Again. */
    fun reset() {
        write(false)
        _seen.value = false
    }

    companion object {
        private const val FILE = "wingtip"
        private val KEY = booleanPreferencesKey("first_flight_seen")

        @Volatile
        private var shared: FirstFlightMemory? = null

        fun of(context: Context): FirstFlightMemory =
            shared ?: synchronized(this) {
                shared ?: Kept.of(context, FILE).let { prefs ->
                    FirstFlightMemory(read = { prefs[KEY] ?: false }, write = { seen -> prefs.edit { it[KEY] = seen } })
                }.also { shared = it }
            }
    }
}
