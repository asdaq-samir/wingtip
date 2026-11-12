package app.wingtipmaps.android.atc

import android.content.Context
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The ATC copilot as one choice (the web's atcListen, the iPhone's
 *  AtcCopilot.Mode): off, or the radio listened to while flying. */
enum class AtcMode { OFF, FLYING }

/** The setting, kept across launches: off until the pilot turns it on,
 *  as the web's and the iPhone's are, since it listens to the cockpit. */
class AtcSetting(private val prefs: Kept) {
    private val _mode = MutableStateFlow(runCatching { AtcMode.valueOf(prefs[KEY] ?: "OFF") }.getOrDefault(AtcMode.OFF))
    val mode: StateFlow<AtcMode> = _mode.asStateFlow()

    fun set(mode: AtcMode) {
        prefs.edit { it[KEY] = mode.name }
        _mode.value = mode
    }

    companion object {
        private val KEY = stringPreferencesKey("mode")

        @Volatile
        private var shared: AtcSetting? = null

        fun of(context: Context): AtcSetting =
            shared ?: synchronized(this) {
                shared ?: AtcSetting(Kept.of(context, "atc")).also { shared = it }
            }
    }
}
