package app.wingtipmaps.android.flight

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import app.wingtipmaps.android.Kept
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * When the glide ring about own ship is drawn (the owner, 2026-11-09):
 * off by default, on by itself while the emergency assistant is open, and
 * on whenever the pilot keeps it on ("glide_ring" in the app's
 * "wingtip" store, the web's key, false unless set). Never without the
 * picked airplane's own glide ratio: the engine's glide_ring answers none
 * then, so no airplane, or a profile without its POH's glide, has no ring
 * even in an emergency.
 */
object GlideRing {
    private val KEY = booleanPreferencesKey("glide_ring")
    private val kept = MutableStateFlow<Boolean?>(null)

    /** Whether the pilot keeps the ring on, read once from disk. */
    fun flow(context: Context): StateFlow<Boolean?> {
        if (kept.value == null) {
            kept.value = Kept.of(context, "wingtip")[KEY] ?: false
        }
        return kept.asStateFlow()
    }

    fun set(context: Context, on: Boolean) {
        Kept.of(context, "wingtip").edit { it[KEY] = on }
        kept.value = on
    }

    /** Whether the ring shows: the pilot's setting or the emergency open. */
    fun shown(kept: Boolean, emergencyOpen: Boolean): Boolean = kept || emergencyOpen

    /** Why the switch can draw no ring: no airplane, or one without its
     *  own glide ratio (no other airplane's is taken); null where it can. */
    enum class Unavailable { NO_AIRPLANE, NO_GLIDE }

    fun unavailable(airplane: Boolean, glideRatio: Double?): Unavailable? = when {
        !airplane -> Unavailable.NO_AIRPLANE
        glideRatio == null -> Unavailable.NO_GLIDE
        else -> null
    }
}
