package app.wingtipmaps.android.share

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/** A file handed to the app read for what it is (FlightFiles), and the
 *  engine's route_file_read answer as the shared flight's preview, the
 *  same answers as apps/web/src/lib/fixtures/routeFile.json. */
class FlightFilesTest {
    private fun json(text: String): JsonElement = Json.parseToJsonElement(text)

    @Test
    fun aFilesKindIsByItsNameThenItsType() {
        assertEquals(FlightFiles.Kind.ROUTE, FlightFiles.kind("KMSN-KOSH.fpl", "application/octet-stream"))
        assertEquals(FlightFiles.Kind.ROUTE, FlightFiles.kind("trip.GPX", null))
        assertEquals(FlightFiles.Kind.PDF, FlightFiles.kind("AIM.pdf", null))
        assertEquals(FlightFiles.Kind.PDF, FlightFiles.kind(null, "application/pdf"))
        assertEquals(FlightFiles.Kind.ROUTE, FlightFiles.kind("route", "application/gpx+xml"))
        assertNull(FlightFiles.kind("photo.jpg", "image/jpeg"))
    }

    @Test
    fun aRouteReadIsASharedFlightToPreview() {
        // The fixture's .fpl case: an airport, a VOR, a user waypoint, an airport.
        val route = FlightFiles.route(
            json(
                """{"name":"KMSN TO KOSH",
                "departure":{"ident":"KMSN","name":"DANE CO RGNL/TRUAX FLD","lat":43.139858,"lon":-89.337514,"kind":"airport"},
                "destination":{"ident":"KOSH","name":"WITTMAN RGNL","lat":43.984389,"lon":-88.556972,"kind":"airport"},
                "between":[{"ident":"MSN","name":"MADISON","lat":43.144772,"lon":-89.338661,"kind":"navaid"},
                {"ident":null,"name":"USR001","lat":43.5,"lon":-88.9,"kind":"user"}]}""",
            ),
        ).getOrThrow()
        val plan = route.link.plan!!
        assertEquals("KMSN", plan.dep)
        assertEquals("KOSH", plan.dest)
        assertEquals(listOf("MSN"), plan.stops)
        assertNull(route.link.token)
        assertEquals(1, route.dropped)
    }

    @Test
    fun theEnginesWordsAreThePilots() {
        val failed = FlightFiles.route(json("""{"error":"This file is not a flight plan (.fpl) or a GPX route."}"""))
        assertTrue(failed.exceptionOrNull() is IllegalArgumentException)
        assertEquals("This file is not a flight plan (.fpl) or a GPX route.", failed.exceptionOrNull()?.message)
    }

    @Test
    fun aFileIsReadNoFurtherThanItsLimit() {
        val big = ByteArray(FlightFiles.MOST_BYTES * 2)
        assertTrue(FlightFiles.bounded(ByteArrayInputStream(big)).size > FlightFiles.MOST_BYTES)
        assertTrue(FlightFiles.bounded(ByteArrayInputStream(big)).size < big.size)
        assertEquals(3, FlightFiles.bounded(ByteArrayInputStream(byteArrayOf(1, 2, 3))).size)
    }
}
