package app.wingtipmaps.android.plates

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
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
 *
 * White on black is the pilot's pick (`invert`), else the dark screen
 * (`dark`), as the reader's pages are (ReaderPage), and the page's light
 * is capped at the chart's own (`brightness`, the Map card's Dimmer): a
 * plate at night is never a white page on the dark map, which would undo
 * the pilot's dark adaptation (AIM 8-1-6; the themes audit, 2026-11-27).
 */
data class PlateLook(
    val annotations: Boolean = true,
    val invert: Boolean? = null,
    val opacity: Float = DEFAULT_OPACITY,
    val shown: Boolean = true,
    val dark: Boolean = false,
    val brightness: Float = 1f,
) {
    /** White on black as drawn: the pick, else the dark screen. */
    val inverted: Boolean get() = invert ?: dark

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
                // Before version 2 a kept "false" was every pilot's who never touched the
                // switch, a white plate at night: read as no pick, so it follows the screen.
                invert = kept[INVERT]?.takeUnless { INVERT in touched || (it == false && (kept[VERSION] ?: 1) < 2) } ?: now.invert,
                opacity = kept[OPACITY]?.takeUnless { OPACITY in touched }?.let(::clamped) ?: now.opacity,
                shown = kept[SHOWN]?.takeUnless { SHOWN in touched } ?: now.shown,
            )
        }
    }

    fun setAnnotations(on: Boolean): Job = keep(ANNOTATIONS, on) { it.copy(annotations = on) }

    /** The pilot's pick, kept with version 2, so a "false" is theirs. */
    fun setInvert(on: Boolean): Job {
        touched += INVERT
        _look.update { it.copy(invert = on) }
        return scope.launch {
            store.edit {
                it[INVERT] = on
                it[VERSION] = 2
            }
        }
    }

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
        private val VERSION = intPreferencesKey("plate_look_version")

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
