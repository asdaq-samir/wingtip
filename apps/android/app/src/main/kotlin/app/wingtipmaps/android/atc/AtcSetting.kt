package app.wingtipmaps.android.atc

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The ATC copilot as one choice (the web's atcListen, the iPhone's
 *  AtcCopilot.Mode): off, or the radio listened to while flying. */
enum class AtcMode { OFF, FLYING }

/** The setting, kept across launches: off until the pilot turns it on,
 *  as the web's and the iPhone's are, since it listens to the cockpit. */
class AtcSetting(private val prefs: SharedPreferences) {
    private val _mode = MutableStateFlow(runCatching { AtcMode.valueOf(prefs.getString(KEY, null) ?: "OFF") }.getOrDefault(AtcMode.OFF))
    val mode: StateFlow<AtcMode> = _mode.asStateFlow()

    fun set(mode: AtcMode) {
        prefs.edit { putString(KEY, mode.name) }
        _mode.value = mode
    }

    companion object {
        private const val KEY = "mode"

        @Volatile
        private var shared: AtcSetting? = null

        fun of(context: Context): AtcSetting =
            shared ?: synchronized(this) {
                shared ?: AtcSetting(context.applicationContext.getSharedPreferences("atc", Context.MODE_PRIVATE)).also { shared = it }
            }
    }
}
