package app.wingtipmaps.android.diagnostics

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Help Improve Wingtip Maps, Help & About's switch: whether this phone
 * sends the gateway its crashes, ANRs, exits and session figures
 * (DiagnosticsReporter), which carry nothing of the pilot's
 * (docs/privacy-inventory.md, Diagnostics). On unless the pilot turns it
 * off, as on the web and the iPhone; off, nothing more is sent, and what
 * was waiting is let go. Kept on the phone beside the diagnostics' own
 * marks, not with the account: a report is no one's. Google Play's own
 * Android vitals are the system's, under the pilot's Android settings.
 */
object HelpImprove {
    private val KEY = booleanPreferencesKey("help_improve")

    @Volatile
    private var state: MutableStateFlow<Boolean>? = null

    /** On where nothing was ever set. */
    fun allows(kept: Boolean?): Boolean = kept ?: true

    /** The switch as it changes, read from the phone once. */
    fun on(context: Context): StateFlow<Boolean> = stateOf(context).asStateFlow()

    fun set(context: Context, on: Boolean) {
        kept(context).edit { it[KEY] = on }
        stateOf(context).value = on
    }

    /** Beside the diagnostics' own marks (Diagnostics' "diagnostics"). */
    private fun kept(context: Context) = Kept.of(context, "diagnostics")

    private fun stateOf(context: Context): MutableStateFlow<Boolean> =
        state ?: synchronized(this) {
            state ?: MutableStateFlow(allows(kept(context)[KEY])).also { state = it }
        }
}
