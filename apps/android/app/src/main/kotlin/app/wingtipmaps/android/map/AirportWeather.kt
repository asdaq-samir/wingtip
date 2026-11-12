package app.wingtipmaps.android.map

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
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

/** How a reporting field wears its weather on the map (the owner's pick,
 *  2026-11-10): nothing; a ring in its flight category's colour round the
 *  chart's own symbol; ForeFlight's filled dot in place of the symbol; or
 *  the ring and the station model at every zoom where it fits. */
enum class AirportWeatherMode(val key: String) {
    OFF("off"), HALO("halo"), DOT("dot"), STATION("station");

    companion object {
        fun of(key: String?): AirportWeatherMode? = entries.firstOrNull { it.key == key }
    }
}

/**
 * The map's airport weather settings, the web's Map card's: the mode,
 * Halo by default, and three switches, all on by default -- the station
 * model once zoomed in close, the wind barbs farther out (`windArrows`,
 * its stored key kept from when they were arrows, as the web keeps its
 * own), and the getting-worse badge at the plan's fields.
 */
data class AirportWeather(
    val mode: AirportWeatherMode = AirportWeatherMode.HALO,
    val stationClose: Boolean = true,
    val windArrows: Boolean = true,
    val worse: Boolean = true,
) {
    /** The station model's zoom, MapLibre's, or null where it is not
     *  drawn: from Leaflet's 10 (STATION_ZOOM) close in, from a region's
     *  scale (STATION_ALWAYS) in the Station mode, never with the weather
     *  off. */
    val stationFromZoom: Double?
        get() = when {
            mode == AirportWeatherMode.OFF -> null
            mode == AirportWeatherMode.STATION -> MapStyle.glZoom(STATION_ALWAYS)
            stationClose -> MapStyle.glZoom(STATION_ZOOM)
            else -> null
        }

    companion object {
        /** Where the station model's barb and two lines fit beside a
         *  field without running into the next one's (Leaflet's zoom, as
         *  MapStyle names its zooms): about a county across a phone. */
        const val STATION_ZOOM = 10.0

        /** The Station mode's zoom (the web's STATION_ALWAYS): a region's
         *  scale, where the fields' own symbols start keeping only a
         *  little apart; out past it the country would be one tangle. */
        const val STATION_ALWAYS = 7.0
    }
}

/**
 * The airport weather settings kept in the app's settings file, each
 * under its own key, as MapLayersStore keeps the map's switches: read
 * once, a choice made before the read lands winning.
 */
class AirportWeatherStore(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    /** One of the switches, by its key in the file. */
    enum class Switch(val key: Preferences.Key<Boolean>) {
        STATION_CLOSE(booleanPreferencesKey("map_wx_station_close")),
        WIND_ARROWS(booleanPreferencesKey("map_wx_wind_arrows")),
        WORSE(booleanPreferencesKey("map_wx_worse")),
    }

    private val _settings = MutableStateFlow(AirportWeather())
    val settings: StateFlow<AirportWeather> = _settings.asStateFlow()

    private val touched = HashSet<Any>()

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        _settings.update { now ->
            val withMode = AirportWeatherMode.of(kept[MODE]).takeIf { MODE !in touched }?.let { now.copy(mode = it) } ?: now
            Switch.entries.fold(withMode) { acc, s ->
                val value = kept[s.key]
                if (value == null || s in touched) acc else turned(acc, s, value)
            }
        }
    }

    /** The mode picked now and kept; the write's job. */
    fun pick(mode: AirportWeatherMode): Job {
        touched += MODE
        _settings.update { it.copy(mode = mode) }
        return scope.launch { store.edit { it[MODE] = mode.key } }
    }

    /** A switch turned on or off now and kept; the write's job. */
    fun set(switch: Switch, on: Boolean): Job {
        touched += switch
        _settings.update { turned(it, switch, on) }
        return scope.launch { store.edit { it[switch.key] = on } }
    }

    companion object {
        private val MODE = stringPreferencesKey("map_wx_mode")

        fun turned(settings: AirportWeather, switch: Switch, on: Boolean): AirportWeather = when (switch) {
            Switch.STATION_CLOSE -> settings.copy(stationClose = on)
            Switch.WIND_ARROWS -> settings.copy(windArrows = on)
            Switch.WORSE -> settings.copy(worse = on)
        }

        @Volatile
        private var shared: AirportWeatherStore? = null

        /** The app's one store of the airport weather settings. */
        fun of(context: Context): AirportWeatherStore =
            shared ?: synchronized(this) {
                shared ?: AirportWeatherStore(
                    context.applicationContext.settings,
                    CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
                ).also { shared = it }
            }
    }
}
