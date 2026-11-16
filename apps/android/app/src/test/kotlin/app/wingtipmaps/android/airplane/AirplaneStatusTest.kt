package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.PastFlightField
import app.wingtipmaps.android.api.generated.PastFlightSummary
import org.junit.Assert.assertEquals
import org.junit.Test

/** The airplane card's status line (the owner's P1, 2026-11-14), as the
 *  web's airplaneStatus.test.ts reads it. */
class AirplaneStatusTest {
    private val now = 1_800_000_000_000L
    private fun flight(onS: Double, landed: Boolean = true, inAir: Boolean = false) =
        PastFlightSummary(id = 1, inAir = inAir, landed = landed, maxAltFt = 4500.0, off = onS - 3600, on = onS, destination = PastFlightField(ident = "KOSH"))

    @Test
    fun checkingThenInTheAirToTheHundredFeet() {
        assertEquals(Status.Checking, statusLine(InAir.Checking, null, now))
        assertEquals(Status.Flying("4,500 ft", 108), statusLine(InAir.Flying("a1b2c3", 4_480.0, 108.4), null, now))
    }

    @Test
    fun onTheGroundSaysWhereItLandedOrThatNoneWasHeard() {
        assertEquals(Status.Landed("KOSH", Ago(Ago.Unit.HOURS, 2)), statusLine(InAir.Ground, listOf(flight(now / 1000.0 - 7200)), now))
        assertEquals(Status.NoneHeard, statusLine(InAir.Ground, emptyList(), now))
        assertEquals(Status.Ground, statusLine(InAir.Ground, null, now))
    }

    @Test
    fun aDayIsWrittenAsTheAppWritesEveryDay() {
        assertEquals("31 Jan 2033", day("2033-01-31"))
    }
}
