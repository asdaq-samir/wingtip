package app.wingtipmaps.android.map

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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

/** The airport weather settings: Halo and every switch on to start, each
 *  choice kept across launches, and the station model's zoom by them. */
class AirportWeatherStoreTest {
    private val dir = createTempDirectory("wx").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun theSettingsStartAsTheOwnersPickAndAreKept() = runBlocking {
        val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "settings.preferences_pb") }
        val first = AirportWeatherStore(store, this)
        first.loaded.join()
        assertEquals(AirportWeather(AirportWeatherMode.HALO, stationClose = true, windArrows = true, worse = true), first.settings.value)
        first.pick(AirportWeatherMode.DOT).join()
        first.set(AirportWeatherStore.Switch.WIND_ARROWS, false).join()

        val next = AirportWeatherStore(store, this)
        next.loaded.join()
        assertEquals(AirportWeatherMode.DOT, next.settings.value.mode)
        assertFalse(next.settings.value.windArrows)
        assertTrue(next.settings.value.worse)
    }

    @Test
    fun theStationModelIsDrawnCloseInAtEveryZoomInStationAndNeverOff() {
        assertEquals(MapStyle.glZoom(AirportWeather.STATION_ZOOM), AirportWeather().stationFromZoom!!, 0.0)
        assertNull(AirportWeather(stationClose = false).stationFromZoom)
        assertEquals(MapStyle.glZoom(AirportWeather.STATION_ALWAYS), AirportWeather(AirportWeatherMode.STATION, stationClose = false).stationFromZoom!!, 0.0)
        assertNull(AirportWeather(AirportWeatherMode.OFF).stationFromZoom)
    }
}
