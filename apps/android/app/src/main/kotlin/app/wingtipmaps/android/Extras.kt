package app.wingtipmaps.android

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** A parked feature, its switch in Settings' Extras, in the order shown:
 *  its key (the web's lib/extras keys) and its row's title and line. */
enum class Extra(val key: String, @StringRes val title: Int, @StringRes val line: Int) {
    ATC_COPILOT("atcCopilot", R.string.extras_atc_copilot, R.string.extras_atc_copilot_line),
    ADSB_RECEIVER("adsbReceiver", R.string.extras_adsb_receiver, R.string.extras_adsb_receiver_line),
    OTHER_AIRPLANES("otherAirplanes", R.string.extras_other_airplanes, R.string.extras_other_airplanes_line),
    MODEL_WEATHER("modelWeather", R.string.extras_model_weather, R.string.extras_model_weather_line),
    ASK("ask", R.string.extras_ask, R.string.extras_ask_line),
}

/**
 * The parked features' switches, Settings' Extras (the feature review,
 * docs/store/feature-review.md, taken by the owner 2026-11-21; the web's
 * lib/extras): a feature parked stays in the code, its tests running, but
 * is off until its switch here is on, and out of the store listing. Off,
 * it is not offered, not started and not fetched, and a setting inside it
 * saved "on" before (Comms Assist, the ATC alerts, the receiver's Auto, a
 * model weather field) acts as off until the switch is on again. All off
 * to start, kept on this phone as "extras.<key>".
 */
class Extras internal constructor(private val prefs: Kept) {
    private val _on = MutableStateFlow(Extra.entries.filter { prefs[keyOf(it)] == true }.toSet())

    /** The switches on, as they change. */
    val on: StateFlow<Set<Extra>> = _on.asStateFlow()

    fun isOn(extra: Extra): Boolean = extra in _on.value

    fun set(extra: Extra, on: Boolean) {
        prefs.edit { it[keyOf(extra)] = on }
        _on.update { if (on) it + extra else it - extra }
    }

    companion object {
        fun keyOf(extra: Extra) = booleanPreferencesKey("extras.${extra.key}")

        @Volatile
        private var shared: Extras? = null

        fun of(context: Context): Extras =
            shared ?: synchronized(this) {
                shared ?: Extras(Kept.of(context, "extras")).also { shared = it }
            }

        /** For code with no context to hand (Nano, a word typed): the
         *  switch as the store made at launch has it (WingtipApplication),
         *  off where there is none yet, as in a unit test. */
        fun now(extra: Extra): Boolean = shared?.isOn(extra) == true
    }
}

/** Whether a parked feature's switch is on, for a screen. */
@Composable
fun rememberExtra(extra: Extra): Boolean {
    val context = LocalContext.current
    val on by remember(context) { Extras.of(context) }.on.collectAsStateWithLifecycle()
    return extra in on
}
