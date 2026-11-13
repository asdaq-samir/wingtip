package app.wingtipmaps.android.map

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.design.generated.WingtipMap
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

/** How a reporting field wears its weather on the map, Settings' Airport
 *  Weather menu in the web's order (the owner, 2026-11-13; its
 *  airportWeatherPrefs): Off, no weather mark on any field (his pick of
 *  2026-11-10, put back first); Flight Category, a ring in the
 *  category's colour round the chart's own symbol; With Wind, the ring
 *  with its wind barbs farther out and the station model close in, the
 *  default; or Station Model wherever it fits. ForeFlight's dot and the
 *  three switches that were under the look are gone. */
enum class AirportWeatherMode(val key: String) {
    OFF("off"), CATEGORY("category"), WIND("wind"), STATION("station");

    companion object {
        fun of(key: String?): AirportWeatherMode? = entries.firstOrNull { it.key == key }

        /** What a phone kept before the menu, brought to one of its
         *  choices as the web's migrateAirportWeather does: Off kept, the
         *  station model kept, the ring with its barbs With Wind, the rest
         *  -- the ring alone, the dot -- Flight Category. */
        fun migrated(look: String?, windArrows: Boolean?): AirportWeatherMode? = when (look) {
            null -> null
            "off" -> OFF
            "station" -> STATION
            "halo" -> if (windArrows != false) WIND else CATEGORY
            "dot" -> CATEGORY
            else -> of(look)
        }
    }
}

/**
 * What the map draws for the airport weather picked (the web's
 * airportWeatherDrawn): the look, the station model zoomed in close, the
 * wind barbs farther out, and the amber getting-worse badge at the plan's
 * fields, drawn with every choice but Off (its switch went, the owner,
 * 2026-11-13).
 */
data class AirportWeather(val mode: AirportWeatherMode = AirportWeatherMode.WIND) {
    val stationClose: Boolean get() = mode == AirportWeatherMode.WIND || mode == AirportWeatherMode.STATION
    val windArrows: Boolean get() = stationClose
    val worse: Boolean get() = mode != AirportWeatherMode.OFF

    /** The station model's zoom, MapLibre's, or null where it is not
     *  drawn: from the tokens' close-in zoom (WingtipMap.ZOOM_STATION_CLOSE,
     *  Leaflet's 10, about a county across a phone, where the barb and two
     *  lines fit beside a field) close in With Wind, from a region's scale
     *  (ZOOM_STATION_ALWAYS, the web's STATION_ALWAYS) as Station Model,
     *  never with the flight category alone or Off. The tokens are
     *  Leaflet's zooms, as MapStyle names its zooms. */
    val stationFromZoom: Double?
        get() = when (mode) {
            AirportWeatherMode.STATION -> MapStyle.glZoom(WingtipMap.ZOOM_STATION_ALWAYS.toDouble())
            AirportWeatherMode.WIND -> MapStyle.glZoom(WingtipMap.ZOOM_STATION_CLOSE.toDouble())
            else -> null
        }
}

/**
 * The airport weather picked, kept in the app's settings file under its
 * own key, as MapLayersStore keeps the map's switches: read once, a pick
 * made before the read lands winning. A phone that kept the old look and
 * its switches is brought to the menu's choice on the first read.
 */
class AirportWeatherStore(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    private val _settings = MutableStateFlow(AirportWeather())
    val settings: StateFlow<AirportWeather> = _settings.asStateFlow()

    private var touched = false

    val loaded: Job = scope.launch {
        val kept = store.data.first()
        val mode = if (kept[SHOW] != null) AirportWeatherMode.of(kept[SHOW]) else AirportWeatherMode.migrated(kept[OLD_LOOK], kept[OLD_WIND])
        if (mode != null && !touched) _settings.update { it.copy(mode = mode) }
    }

    /** The choice picked now and kept; the write's job. */
    fun pick(mode: AirportWeatherMode): Job {
        touched = true
        _settings.update { it.copy(mode = mode) }
        return scope.launch { store.edit { it[SHOW] = mode.key } }
    }

    companion object {
        /** The menu's choice (the web's wingtip.airportWeather version 1). */
        private val SHOW = stringPreferencesKey("map_wx_show")

        /** What the look and the barbs' switch were kept under before. */
        private val OLD_LOOK = stringPreferencesKey("map_wx_mode")
        private val OLD_WIND = booleanPreferencesKey("map_wx_wind_arrows")

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
