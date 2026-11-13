package app.wingtipmaps.android.map

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.design.generated.WingtipMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** Settings' Airport Weather: one menu of Off, Flight Category, With Wind
 *  and Station Model, With Wind to start, the pick kept across launches,
 *  and a phone's old look and switches brought to it. */
class AirportWeatherStoreTest {
    private val dir = createTempDirectory("wx").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun withWindToStartAndThePickIsKept() = runBlocking {
        val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "settings.preferences_pb") }
        val first = AirportWeatherStore(store, this)
        first.loaded.join()
        assertEquals(AirportWeatherMode.WIND, first.settings.value.mode)
        first.pick(AirportWeatherMode.OFF).join()

        val next = AirportWeatherStore(store, this)
        next.loaded.join()
        assertEquals(AirportWeatherMode.OFF, next.settings.value.mode)
    }

    @Test
    fun theOldLookIsBroughtToTheMenu() = runBlocking {
        val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "old.preferences_pb") }
        store.edit {
            it[stringPreferencesKey("map_wx_mode")] = "halo"
            it[booleanPreferencesKey("map_wx_wind_arrows")] = false
        }
        val kept = AirportWeatherStore(store, this)
        kept.loaded.join()
        assertEquals(AirportWeatherMode.CATEGORY, kept.settings.value.mode)
        assertEquals(AirportWeatherMode.WIND, AirportWeatherMode.migrated("halo", null))
        assertEquals(AirportWeatherMode.CATEGORY, AirportWeatherMode.migrated("dot", true))
        assertEquals(AirportWeatherMode.OFF, AirportWeatherMode.migrated("off", true))
        assertEquals(AirportWeatherMode.STATION, AirportWeatherMode.migrated("station", false))
    }

    @Test
    fun eachChoiceDrawsWhatTheWebsDoes() {
        assertEquals(MapStyle.glZoom(WingtipMap.ZOOM_STATION_CLOSE.toDouble()), AirportWeather().stationFromZoom!!, 0.0)
        assertNull(AirportWeather(AirportWeatherMode.CATEGORY).stationFromZoom)
        assertEquals(MapStyle.glZoom(WingtipMap.ZOOM_STATION_ALWAYS.toDouble()), AirportWeather(AirportWeatherMode.STATION).stationFromZoom!!, 0.0)
        assertNull(AirportWeather(AirportWeatherMode.OFF).stationFromZoom)
        assertTrue(AirportWeather(AirportWeatherMode.CATEGORY).worse)
        assertFalse(AirportWeather(AirportWeatherMode.CATEGORY).windArrows)
        assertFalse(AirportWeather(AirportWeatherMode.OFF).worse)
    }
}
