package app.wingtipmaps.android.here

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.AirportAtis
import app.wingtipmaps.android.api.generated.AirportRvr
import app.wingtipmaps.android.api.generated.AirspaceAt
import app.wingtipmaps.android.api.generated.AirspaceBand
import app.wingtipmaps.android.api.generated.DepartureEvents
import app.wingtipmaps.android.api.generated.FlowAtAirports
import app.wingtipmaps.android.api.generated.SaaStatuses
import app.wingtipmaps.android.live.LiveSource
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ui.RouteActions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** What's Here: the planner's answer for the point held, asked once a
 *  point, a failure said with Try Again, and the point into the route
 *  as the airspace ring's is. */
class HereModelTest {
    @get:Rule val main = MainRule()

    private class Fake(var fail: Boolean = false) : LiveSource {
        val asked = mutableListOf<Pair<Double, Double>>()
        override suspend fun atis(airport: String): AirportAtis = error("not asked")
        override suspend fun rvr(airport: String): AirportRvr = error("not asked")
        override suspend fun flow(airports: List<String>): FlowAtAirports = error("not asked")
        override suspend fun saa(designators: List<String>): SaaStatuses = error("not asked")
        override suspend fun departures(ident: String): DepartureEvents = error("not asked")
        override suspend fun airspaceAt(lat: Double, lon: Double): AirspaceAt {
            asked += lat to lon
            if (fail) error("offline")
            val band = AirspaceBand(ceilingFt = 4700.0, airspaceClass = "C", entry = "Two-way radio contact.", floorFt = 0.0, name = "MADISON")
            return AirspaceAt(bands = listOf(band), lat = lat, lon = lon, groundFt = 860.0)
        }
    }

    @Test
    fun thePointIsAskedOnce() {
        val source = Fake()
        val m = HereModel(source)
        m.at(43.14, -89.34)
        m.at(43.14, -89.34)
        assertEquals(1, source.asked.size)
        assertFalse(m.state.value.loading)
        assertEquals("C", m.state.value.here!!.bands.single().airspaceClass)
        m.at(43.0, -89.0)
        assertEquals(2, source.asked.size)
    }

    @Test
    fun aFailureIsSaidAndAskedAgain() {
        val source = Fake(fail = true)
        val m = HereModel(source)
        m.at(43.14, -89.34)
        assertEquals("The airspace here could not be fetched.", m.state.value.problem)
        source.fail = false
        m.retry()
        assertNull(m.state.value.problem)
        assertEquals(860.0, m.state.value.here!!.groundFt!!, 0.0)
    }

    @Test
    fun thePointGoesIntoTheRouteAsAPlace() {
        val p = RouteActions.pointOf(MapPick.Here(43.14, -89.34))!!
        assertEquals("@43.1400,-89.3400", p.ident)
    }
}
