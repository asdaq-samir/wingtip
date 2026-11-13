package app.wingtipmaps.android.flight

import org.junit.Assert.assertEquals
import org.junit.Test

/** The location service runs only on the pilot's Start Flight (Play's
 *  rule for a location foreground service), and only while flying. */
class StartFlightTest {
    @Test
    fun flyingSpeedAsksAndStartsNothingByItself() {
        val asked = StartFlight()
        assertEquals(false to false, asked.took(flying = false))
        assertEquals(true to false, asked.took(flying = true))
        assertEquals(true to false, asked.took(flying = true))
    }

    @Test
    fun startFlightRunsTheServiceUntilTheAirplaneSlows() {
        val asked = StartFlight()
        asked.took(flying = true)
        asked.start()
        assertEquals(false to true, asked.took(flying = true))
        // Landed: off, and the next flight asks again.
        assertEquals(false to false, asked.took(flying = false))
        assertEquals(true to false, asked.took(flying = true))
    }

    @Test
    fun notNowHoldsForTheFlightOnly() {
        val asked = StartFlight()
        asked.took(flying = true)
        asked.notNow()
        assertEquals(false to false, asked.took(flying = true))
        asked.took(flying = false)
        assertEquals(true to false, asked.took(flying = true))
    }
}
