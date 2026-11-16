package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.Metar
import org.junit.Assert.assertEquals
import org.junit.Test

/** The airport card's one-line report under its tabs (the owner's T4,
 *  2026-11-14), as the web's weatherLine.test.ts reads it. */
class AirportTabsTest {
    private fun line(m: Metar) = weatherLine(m, "No ceiling", "Calm") { "Ceiling $it" }

    @Test
    fun theReportIsItsCeilingTrueWindAndTime() {
        val m = Metar(ceilingFt = 1800.0, windDirTrueDeg = 310.0, windSpeedKt = 4.0, observedAt = "2026-11-14T12:55:00Z", flightCategory = "MVFR")
        assertEquals("Ceiling 1,800 ft · 310°T 4 kt · 1255Z", line(m))
    }

    @Test
    fun anUnknownCeilingIsLeftOutAndAGustIsWrittenOnTheSpeed() {
        val m = Metar(ceilingUnknown = true, windSpeedKt = 12.0, windGustKt = 20.0)
        assertEquals("VRB 12G20 kt", line(m))
    }

    @Test
    fun noCeilingIsSaidAndAnUnreportedWindLeftOut() {
        // Calm is the engine's wind_calm, which the JVM's tests do not load.
        assertEquals("No ceiling · 1255Z", line(Metar(observedAt = "2026-11-14T12:55:00Z")))
    }
}
