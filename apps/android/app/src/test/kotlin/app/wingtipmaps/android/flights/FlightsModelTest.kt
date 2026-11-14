package app.wingtipmaps.android.flights

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.ZoneOffset

/** Saved Flights (AND-6): the gateway's list shown, a failure said in
 *  place, each flight's route and "saved" date as the web writes them. */
class FlightsModelTest {
    @get:Rule val main = MainRule()

    private val flight = FlightSummaryDto(createdAt = "2026-11-14T03:00:00Z", departureIdent = "KDPA", destinationIdent = "KMSN", id = 7, stops = listOf("KJVL"))

    @Test
    fun theFlightsAreListedWithTheirRouteAndSavedDate() {
        val model = FlightsModel { listOf(flight) }
        model.load()
        assertEquals(listOf(flight), model.state.value.flights)
        assertEquals("KDPA → KJVL → KMSN", FlightsModel.route(flight))
        assertEquals("saved 14 Nov 2026", FlightsModel.savedOn(flight.createdAt, ZoneOffset.UTC))
    }

    @Test
    fun aFailureIsSaidWhereTheListWouldBe() {
        val model = FlightsModel { throw java.io.IOException("offline") }
        model.load()
        assertNotNull(model.state.value.problem)
        assertTrue(model.state.value.flights.isEmpty())
    }
}
