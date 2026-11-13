package app.wingtipmaps.android.firstflight

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The FPL's one tip (the web's FplTip, under its "fpl-tip" key): due once
 * the first route is planned, shown at the pages' toggle while it reads
 * FPL (SheetSideButtons), and never again once closed.
 */
class FplTip(private val prefs: Kept) {
    private val _shown = MutableStateFlow(false)

    /** Whether the tip is up: due and not yet closed. */
    val shown: StateFlow<Boolean> = _shown.asStateFlow()

    /** The first route planned: the tip comes up, unless it was closed before. */
    fun due() {
        if (prefs[KEY] != true) _shown.value = true
    }

    /** Closed: kept, and not offered again. */
    fun close() {
        prefs.edit { it[KEY] = true }
        _shown.value = false
    }

    companion object {
        private val KEY = booleanPreferencesKey("fpl_tip_seen")

        @Volatile
        private var shared: FplTip? = null

        fun of(context: Context): FplTip =
            shared ?: synchronized(this) {
                shared ?: FplTip(Kept.of(context, "wingtip")).also { shared = it }
            }
    }
}
