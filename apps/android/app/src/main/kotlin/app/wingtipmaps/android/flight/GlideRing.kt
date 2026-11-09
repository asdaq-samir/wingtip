package app.wingtipmaps.android.flight

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * When the glide ring about own ship is drawn (the owner, 2026-11-09):
 * off by default, on by itself while the emergency assistant is open, and
 * on whenever the pilot keeps it on ("glide_ring" in the app's
 * SharedPreferences, the web's key, false unless set). Never without the
 * picked airplane's own glide ratio: the engine's glide_ring answers none
 * then, so no airplane, or a profile without its POH's glide, has no ring
 * even in an emergency.
 */
object GlideRing {
    private const val KEY = "glide_ring"
    private val kept = MutableStateFlow<Boolean?>(null)

    /** Whether the pilot keeps the ring on, read once from disk. */
    fun flow(context: Context): StateFlow<Boolean?> {
        if (kept.value == null) {
            kept.value = context.getSharedPreferences("wingtip", Context.MODE_PRIVATE).getBoolean(KEY, false)
        }
        return kept.asStateFlow()
    }

    fun set(context: Context, on: Boolean) {
        context.getSharedPreferences("wingtip", Context.MODE_PRIVATE).edit().putBoolean(KEY, on).apply()
        kept.value = on
    }

    /** Whether the ring shows: the pilot's setting or the emergency open. */
    fun shown(kept: Boolean, emergencyOpen: Boolean): Boolean = kept || emergencyOpen
}
