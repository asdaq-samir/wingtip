package app.wingtipmaps.android.welcome

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the welcome has been seen on this install: finished or skipped,
 * it is not shown again until Setup's Show Welcome Again resets it. Kept in
 * the app's own preferences file beside the layout (LayoutPreference), and
 * held in one StateFlow so the root, which shows the welcome, and Setup,
 * which resets it, see the same value the moment it changes. The reading
 * and writing are handed in, so the tests keep it in memory.
 */
class WelcomeMemory(private val read: () -> Boolean, private val write: (Boolean) -> Unit) {
    private val _seen = MutableStateFlow(read())
    val seen: StateFlow<Boolean> = _seen.asStateFlow()

    fun markSeen() {
        write(true)
        _seen.value = true
    }

    /** Setup's Show Welcome Again: the welcome opens again at its start. */
    fun reset() {
        write(false)
        _seen.value = false
    }

    companion object {
        private const val FILE = "wingtip"
        private const val KEY = "welcome_seen"

        @Volatile
        private var shared: WelcomeMemory? = null

        fun of(context: Context): WelcomeMemory =
            shared ?: synchronized(this) {
                shared ?: context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE).let { prefs ->
                    WelcomeMemory(read = { prefs.getBoolean(KEY, false) }, write = { seen -> prefs.edit { putBoolean(KEY, seen) } })
                }.also { shared = it }
            }
    }
}
