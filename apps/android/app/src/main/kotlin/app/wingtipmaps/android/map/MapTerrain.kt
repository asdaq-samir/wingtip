package app.wingtipmaps.android.map

import android.annotation.SuppressLint
import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** How the ground is drawn (the web's TerrainMode): its relief shaded
 *  over the chart, always now (the owner, 2026-11-13, took Flat out), or
 *  the map tilted into 3D. OFF is only the 3D layer's own "not yet read".
 *  `key` is what the settings file keeps. */
enum class TerrainMode(val key: String) { OFF("off"), RELIEF("relief"), THREE_D("3d") }

/**
 * The map's 3D, the round map button's (ThreeDButton, as Apple Maps' and
 * the web's 3D circle), kept in the settings file across launches over
 * the shaded relief that is always drawn, and the field whose way in the
 * 3D view draws: the open card's, else the route's destination (the web's
 * TerrainGl `field`). A tap made before the kept one is read wins, as
 * MapLayersStore's switches do; a kept "off" (Flat, gone) is the relief.
 */
class MapTerrain private constructor(private val context: Context, private val scope: CoroutineScope) {
    private val _mode = MutableStateFlow(TerrainMode.RELIEF)
    val mode: StateFlow<TerrainMode> = _mode.asStateFlow()
    private var touched = false

    /** How many times 3D stands its heights up (the Map card's Heights,
     *  the web's heightStretch): ×3 unless picked, so a Class B reads as
     *  the upside-down wedding cake it is (the owner, 2026-11-14). A
     *  display factor, not an aviation figure: every word keeps the true
     *  altitudes. */
    private val _stretch = MutableStateFlow(DEFAULT_STRETCH)
    val stretch: StateFlow<Int> = _stretch.asStateFlow()
    private var stretchTouched = false

    init {
        scope.launch {
            val kept = context.settings.data.first()
            if (!touched) _mode.value = if (kept[KEY] == TerrainMode.THREE_D.key) TerrainMode.THREE_D else TerrainMode.RELIEF
            if (!stretchTouched) _stretch.value = kept[STRETCH]?.takeIf { it in STRETCHES } ?: DEFAULT_STRETCH
        }
    }

    /** Heights picked, kept. */
    fun setStretch(times: Int) {
        if (times !in STRETCHES) return
        stretchTouched = true
        _stretch.value = times
        scope.launch { context.settings.edit { it[STRETCH] = times } }
    }

    /** 3D on or off, kept. */
    fun set3d(on: Boolean) {
        touched = true
        val mode = if (on) TerrainMode.THREE_D else TerrainMode.RELIEF
        _mode.value = mode
        scope.launch { context.settings.edit { it[KEY] = mode.key } }
    }

    companion object {
        private val KEY = stringPreferencesKey("map_terrain")
        private val STRETCH = intPreferencesKey("map_height_stretch")

        /** Heights' three, ×1 (true scale), ×3 and ×5 (the web's HEIGHT_STRETCHES). */
        val STRETCHES = listOf(1, 3, 5)
        const val DEFAULT_STRETCH = 3

        private val selected = MutableStateFlow<String?>(null)
        private val destination = MutableStateFlow<String?>(null)
        private val _field = MutableStateFlow<String?>(null)

        /** The field whose way in is drawn in 3D: the open card's, else the
         *  route's destination; null for none. */
        val field: StateFlow<String?> = _field.asStateFlow()

        /** The field whose card is open (ChartMap's selectedField). */
        fun selected(ident: String?) {
            selected.value = ident
            _field.value = ident ?: destination.value
        }

        /** The route's destination, its last point (ChartMap's routePoints). */
        fun destination(ident: String?) {
            destination.value = ident
            _field.value = selected.value ?: ident
        }

        // The application's context alone (of), which lives as long as the process.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: MapTerrain? = null

        fun of(context: Context): MapTerrain =
            shared ?: synchronized(this) {
                shared ?: MapTerrain(context.applicationContext, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)).also { shared = it }
            }
    }
}
