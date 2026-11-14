package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.AircraftModel
import app.wingtipmaps.android.api.generated.AircraftRegistration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import app.wingtipmaps.android.ui.card.Status as BadgeStatus

/** The airplane cards' fact strip and status badge (the owner, 2026-11-14:
 *  "make sure the airplane card looks similar to airport card"), as the
 *  web's AirplaneFacts.test reads them, and the sketch's fit. */
class AirplaneFactsTest {
    private val record = AircraftRegistration(
        nNumber = "N12345", manufacturer = "PIPER", model = "PA-28-140", year = 1971, seats = 4, engines = 1,
        status = "Valid", standing = "valid", owner = "SMITH JOHN",
    )

    @Test
    fun theRecordsFactsWithTheReferenceModelsFiguresFirst() {
        val said = AirplaneFactsSaid.of(record, AircraftModel(code = "7100520", seats = 2))
        assertEquals("PIPER PA-28-140", said.type)
        assertEquals("1971", said.year)
        assertEquals(2, said.seats)
        assertEquals(1, said.engines)
        assertEquals("Valid", said.registration)
        assertEquals("SMITH JOHN", said.owner)
    }

    @Test
    fun aLapsedRegistrationAndAWithheldOwnerAreSaid() {
        val said = AirplaneFactsSaid.of(record.copy(standing = "lapsed", owner = null))
        assertTrue(said.lapsed)
        assertTrue(said.hasRecord)
        assertNull(said.owner)
    }

    @Test
    fun withNoRecordTheTrafficsTypeStandsInAndNothingIsEmptyStrip() {
        assertEquals("C172", AirplaneFactsSaid.of(null, type = "C172").type)
        assertTrue(AirplaneFactsSaid.of(null).empty)
    }

    @Test
    fun theStatusLineLeadsWithItsBadge() {
        assertEquals(BadgeStatus.InAir, Status.Flying("4,500 ft", 108).badge)
        assertEquals(BadgeStatus.Ground, Status.Landed("KOSH", Ago(Ago.Unit.HOURS, 2)).badge)
        assertNull(Status.NoneHeard.badge)
    }

    @Test
    fun theSketchKeepsItsShapeNorthUpInTheMiddle() {
        val at = sketchFit(listOf(0.0, 0.0), listOf(0.0, 1.0), 200f, 100f, 10f)
        assertEquals(10f, at[0].x, 0.01f)
        assertEquals(190f, at[1].x, 0.01f)
        assertEquals(50f, at[0].y, 0.01f)
        val north = sketchFit(listOf(0.0, 1.0), listOf(0.0, 0.0), 100f, 100f, 10f)
        assertTrue(north[1].y < north[0].y)
    }
}
