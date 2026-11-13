package app.wingtipmaps.android.atc

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Comms Assist, Settings' switch under In Flight › ATC (the owner,
 * 2026-11-13: "Or actually make it a setting instead"): the radio's
 * round button on the map, which opens the clearance card, drawn only
 * while it is on; off until the pilot turns it on, as the web's
 * lib/atc/commsAssist is, kept beside the ATC copilot's setting.
 */
class CommsAssist(private val prefs: Kept) {
    private val _on = MutableStateFlow(prefs[KEY] ?: false)
    val on: StateFlow<Boolean> = _on.asStateFlow()

    fun set(on: Boolean) {
        prefs.edit { it[KEY] = on }
        _on.value = on
    }

    companion object {
        private val KEY = booleanPreferencesKey("comms_assist")

        @Volatile
        private var shared: CommsAssist? = null

        fun of(context: Context): CommsAssist =
            shared ?: synchronized(this) {
                shared ?: CommsAssist(Kept.of(context, "atc")).also { shared = it }
            }
    }
}
