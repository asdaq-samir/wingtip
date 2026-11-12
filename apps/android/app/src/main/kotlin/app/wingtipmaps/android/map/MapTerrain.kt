package app.wingtipmaps.android.map

import android.annotation.SuppressLint
import android.content.Context
import androidx.datastore.preferences.core.edit
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

/** How the ground is drawn (the web's TerrainMode): not at all, its relief
 *  shaded over the chart, or the map tilted into 3D. `key` is what the
 *  settings file keeps. */
enum class TerrainMode(val key: String) { OFF("off"), RELIEF("relief"), THREE_D("3d") }

/**
 * The map's Terrain choice (Map Settings' Terrain, the web's Map menu's),
 * kept in the settings file across launches, and the field whose way in
 * the 3D view draws: the open card's, else the route's destination (the
 * web's TerrainGl `field`). A pick made before the kept one is read wins,
 * as MapLayersStore's switches do.
 */
class MapTerrain private constructor(private val context: Context, private val scope: CoroutineScope) {
    private val _mode = MutableStateFlow(TerrainMode.OFF)
    val mode: StateFlow<TerrainMode> = _mode.asStateFlow()
    private var touched = false

    init {
        scope.launch {
            val kept = context.settings.data.first()[KEY]
            if (!touched) _mode.value = TerrainMode.entries.firstOrNull { it.key == kept } ?: TerrainMode.OFF
        }
    }

    fun pick(mode: TerrainMode) {
        touched = true
        _mode.value = mode
        scope.launch { context.settings.edit { it[KEY] = mode.key } }
    }

    companion object {
        private val KEY = stringPreferencesKey("map_terrain")

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
