package app.wingtipmaps.android.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A weather mark heard longer ago than a METAR's freshness is greyed,
 *  never shown in its old category's colour as if it were now's. */
class WeatherAgeTest {
    private val now = 10 * 3_600_000L

    @Test
    fun aMarkPastItsFreshnessIsStale() {
        val heard = mapOf("KOSH" to now - 20 * 60_000L, "KMSN" to now - 75 * 60_000L)
        assertEquals(setOf("KMSN"), WeatherAge.stale(heard, now, freshMin = 60.0))
        // The engine could not say: nothing is called stale.
        assertTrue(WeatherAge.stale(heard, now, freshMin = null).isEmpty())
    }

    @Test
    fun aStaleMarkWearsTheGreyAndAFreshOneItsCategory() {
        val pips = AirportWeatherMarks.pips(mapOf("KOSH" to "VFR", "KMSN" to "IFR"), AirportWeatherMode.CATEGORY, stale = setOf("KMSN"))
        assertEquals("h" + AirportWeatherMarks.CATEGORY_COLOURS.getValue("VFR"), pips["KOSH"])
        assertEquals("h" + AirportWeatherMarks.STALE, pips["KMSN"])
        // Every pip worn has its picture.
        assertTrue(pips.values.all { it in AirportWeatherMarks.PIPS })
    }
}
