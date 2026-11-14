package app.wingtipmaps.android.map

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
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
 * What the map draws over the chart, the web's map settings
 * (apps/web/src/lib/preferences.ts, components/MapSettings.tsx "On the
 * Map") with the web's defaults: the Class B, C and D and the VORs and
 * fixes on until turned off (the owner's pick of the map's looks,
 * 2026-10-29); the terminal area chart pinned over the sectional off; the
 * private fields off (the owner, 2026-10-27: one is landed at only with
 * its owner's leave, NASR APT_BASE facility use PR); the armed services'
 * own fields off (a civil airplane lands there only with the service's
 * permission). A joint-use field is drawn either way.
 */
data class MapLayers(
    val airspace: Boolean = true,
    val navaids: Boolean = true,
    val tac: Boolean = false,
    val privateFields: Boolean = false,
    val military: Boolean = false,
) {
    /**
     * What the chart draws while the emergency assistant is open: every
     * private and military field too, whatever their switches say, since in
     * an emergency the pilot may land at any of them (14 CFR 91.3(b)) and
     * the assistant's list ranks them (the owner, 2026-11-13). The switches
     * themselves are not touched, so they are as the pilot left them once
     * it closes.
     */
    fun duringEmergency(open: Boolean): MapLayers = if (open) copy(privateFields = true, military = true) else this
}

/**
 * The map's switches kept in the app's settings file, each under its own
 * key, so a choice holds across launches; read once, a choice made before
 * the read lands winning, as TrafficSwitch does. Its own small piece so
 * its wiring is tested on a plain DataStore.
 */
class MapLayersStore(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    /** One of the switches, by its key in the file. */
    enum class Switch(val key: Preferences.Key<Boolean>) {
        AIRSPACE(booleanPreferencesKey("map_airspace")),
        NAVAIDS(booleanPreferencesKey("map_navaids")),
        TAC(booleanPreferencesKey("map_tac")),
        PRIVATE_FIELDS(booleanPreferencesKey("map_private_fields")),
        MILITARY(booleanPreferencesKey("map_military")),
    }

    private val _layers = MutableStateFlow(MapLayers())
    val layers: StateFlow<MapLayers> = _layers.asStateFlow()

    /** The switches set before the kept values were read, which the read
     *  leaves as the pilot set them. */
    private val touched = HashSet<Switch>()

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        _layers.update { now ->
            Switch.entries.fold(now) { acc, s ->
                val value = kept[s.key]
                if (value == null || s in touched) acc else turned(acc, s, value)
            }
        }
    }

    /** A switch turned on or off now and kept; the write's job. */
    fun set(switch: Switch, on: Boolean): Job {
        touched += switch
        _layers.update { turned(it, switch, on) }
        return scope.launch { store.edit { it[switch.key] = on } }
    }

    companion object {
        fun turned(layers: MapLayers, switch: Switch, on: Boolean): MapLayers = when (switch) {
            Switch.AIRSPACE -> layers.copy(airspace = on)
            Switch.NAVAIDS -> layers.copy(navaids = on)
            Switch.TAC -> layers.copy(tac = on)
            Switch.PRIVATE_FIELDS -> layers.copy(privateFields = on)
            Switch.MILITARY -> layers.copy(military = on)
        }

        @Volatile
        private var shared: MapLayersStore? = null

        /** The app's one store of the map's switches. */
        fun of(context: Context): MapLayersStore =
            shared ?: synchronized(this) {
                shared ?: MapLayersStore(
                    context.applicationContext.settings,
                    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                ).also { shared = it }
            }
    }
}
