package app.wingtipmaps.android.map

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
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
 * The Map card's Terrain Hazards and Red Within, kept in the app's
 * settings file across launches (the web's preferences hazard and
 * hazardClearanceFt): off unless picked, and the clearance null until
 * picked, so the engine's default stands and no figure is held here. Read
 * once; a pick made before the read lands wins, as MapLayersStore's.
 */
class HazardPrefs(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    data class Picks(val setting: Hazard.Setting = Hazard.Setting.OFF, val clearanceFt: Double? = null)

    private val _picks = MutableStateFlow(Picks())
    val picks: StateFlow<Picks> = _picks.asStateFlow()
    private var touched = false

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        if (touched) return@launch
        val setting = Hazard.Setting.entries.firstOrNull { it.key == kept[SETTING] } ?: Hazard.Setting.OFF
        _picks.value = Picks(setting, kept[CLEARANCE])
    }

    fun setting(setting: Hazard.Setting): Job {
        touched = true
        _picks.update { it.copy(setting = setting) }
        return scope.launch { store.edit { it[SETTING] = setting.key } }
    }

    fun clearance(ft: Double): Job {
        touched = true
        _picks.update { it.copy(clearanceFt = ft) }
        return scope.launch { store.edit { it[CLEARANCE] = ft } }
    }

    companion object {
        private val SETTING = stringPreferencesKey("map_hazard")
        private val CLEARANCE = doublePreferencesKey("map_hazard_clearance_ft")

        @Volatile
        private var shared: HazardPrefs? = null

        /** The app's one store of the hazard picks. */
        fun of(context: Context): HazardPrefs =
            shared ?: synchronized(this) {
                shared ?: HazardPrefs(
                    context.applicationContext.settings,
                    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                ).also { shared = it }
            }
    }
}
