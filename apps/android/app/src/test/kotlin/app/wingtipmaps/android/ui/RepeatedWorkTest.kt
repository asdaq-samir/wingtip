package app.wingtipmaps.android.ui

import app.wingtipmaps.android.flight.OwnShip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** What a card reads of own ship so it is not drawn again at every fix
 *  (the phones' wasted-work audit, 2026-11-21): the airplane's place to a
 *  thousandth of a degree, the same through a parked airplane's jitter. */
class RepeatedWorkTest {
    private fun fix(lat: Double, lon: Double) = OwnShip.Fix(lat, lon, 800.0, 0.0, 0.0, 5.0, 0L)

    @Test
    fun aParkedAirplanesJitterLeavesTheCardsPlaceAlone() {
        // Five metres of GPS wander (about 0.00005 degrees) is the same place.
        assertEquals(AirportFacts.From(42.123, -88.457), AirportFacts.From.near(fix(42.12301, -88.45702)))
        assertEquals(AirportFacts.From.near(fix(42.12301, -88.45702)), AirportFacts.From.near(fix(42.12305, -88.45698)))
        // A tenth of a mile north (0.0017 degrees) is a new one.
        assertNotEquals(AirportFacts.From.near(fix(42.123, -88.457)), AirportFacts.From.near(fix(42.1247, -88.457)))
    }
}
