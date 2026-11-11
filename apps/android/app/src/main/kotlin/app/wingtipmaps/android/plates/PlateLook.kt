package app.wingtipmaps.android.plates

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * How an approach's plate is drawn on the map, set from the plate's card
 * (PlateCard) as ForeFlight's is (the owner's screenshots, 2026-11-11):
 * the fixes' tags on (Show Annotations), the page white on black for
 * night (Invert Plate Colors), and how solid it is, from clear (0) to
 * solid (1); and whether plates are laid on the chart at all, the Map
 * Settings' Approach Plates switch (the web's `plates` preference, on).
 */
data class PlateLook(
    val annotations: Boolean = true,
    val invert: Boolean = false,
    val opacity: Float = DEFAULT_OPACITY,
    val shown: Boolean = true,
) {
    companion object {
        /** Nearly solid, so the page reads as ForeFlight's does as it opens,
         *  with a little of the chart showing through at its edges. */
        const val DEFAULT_OPACITY = 0.85f

        /** The faintest the slider goes: a plate turned all the way to
         *  clear is still found by a tap, so its card can bring it back. */
        const val LEAST_OPACITY = 0.1f
    }
}

/**
 * The plate's settings kept in the app's settings file, each under its
 * own key, so they hold across launches on this phone (kept per device,
 * as the web keeps them in the browser); read once, a choice made before
 * the read lands winning, as MapLayersStore does. Its own small piece so
 * its wiring is tested on a plain DataStore.
 */
class PlateLookStore(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    private val _look = MutableStateFlow(PlateLook())
    val look: StateFlow<PlateLook> = _look.asStateFlow()

    /** The keys set before the kept values were read, which the read leaves as set. */
    private val touched = HashSet<Preferences.Key<*>>()

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        _look.update { now ->
            PlateLook(
                annotations = kept[ANNOTATIONS]?.takeUnless { ANNOTATIONS in touched } ?: now.annotations,
                invert = kept[INVERT]?.takeUnless { INVERT in touched } ?: now.invert,
                opacity = kept[OPACITY]?.takeUnless { OPACITY in touched }?.let(::clamped) ?: now.opacity,
                shown = kept[SHOWN]?.takeUnless { SHOWN in touched } ?: now.shown,
            )
        }
    }

    fun setAnnotations(on: Boolean): Job = keep(ANNOTATIONS, on) { it.copy(annotations = on) }

    fun setInvert(on: Boolean): Job = keep(INVERT, on) { it.copy(invert = on) }

    /** The slider's place, kept within LEAST_OPACITY and solid. */
    fun setOpacity(value: Float): Job = clamped(value).let { v -> keep(OPACITY, v) { it.copy(opacity = v) } }

    /** The slider's place as it is dragged: the map follows it, and the
     *  file is written once, as the drag ends (setOpacity). */
    fun dragOpacity(value: Float) {
        touched += OPACITY
        _look.update { it.copy(opacity = clamped(value)) }
    }

    fun setShown(on: Boolean): Job = keep(SHOWN, on) { it.copy(shown = on) }

    private fun <T> keep(key: Preferences.Key<T>, value: T, change: (PlateLook) -> PlateLook): Job {
        touched += key
        _look.update(change)
        return scope.launch { store.edit { it[key] = value } }
    }

    companion object {
        private val ANNOTATIONS = booleanPreferencesKey("plate_annotations")
        private val INVERT = booleanPreferencesKey("plate_invert")
        private val OPACITY = floatPreferencesKey("plate_opacity")
        private val SHOWN = booleanPreferencesKey("map_plates")

        fun clamped(value: Float): Float = value.coerceIn(PlateLook.LEAST_OPACITY, 1f)

        @Volatile
        private var shared: PlateLookStore? = null

        /** The app's one store of the plate's settings. */
        fun of(context: Context): PlateLookStore =
            shared ?: synchronized(this) {
                shared ?: PlateLookStore(
                    context.applicationContext.settings,
                    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                ).also { shared = it }
            }
    }
}
