package app.wingtipmaps.android.share

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

/** A file handed to the app read for what it is (FlightFiles), and the
 *  engine's read_route_file answer as the shared flight's preview, the
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
        val route = FlightFiles.route(json("""{"dep":"KMSN","dest":"KOSH","stops":["DLL"],"name":"KMSN TO KOSH","dropped":1}""")).getOrThrow()
        val plan = route.link.plan!!
        assertEquals("KMSN", plan.dep)
        assertEquals("KOSH", plan.dest)
        assertEquals(listOf("DLL"), plan.stops)
        assertNull(route.link.token)
        assertEquals(1, route.dropped)
    }

    @Test
    fun theEnginesWordsAreThePilots() {
        val failed = FlightFiles.route(json("""{"error":"This file is not a Garmin flight plan (.fpl) or a GPX route."}"""))
        assertTrue(failed.exceptionOrNull() is IllegalArgumentException)
        assertEquals("This file is not a Garmin flight plan (.fpl) or a GPX route.", failed.exceptionOrNull()?.message)
    }

    @Test
    fun aFileIsReadNoFurtherThanItsLimit() {
        val big = ByteArray(FlightFiles.MOST_BYTES * 2)
        assertTrue(FlightFiles.bounded(ByteArrayInputStream(big)).size > FlightFiles.MOST_BYTES)
        assertTrue(FlightFiles.bounded(ByteArrayInputStream(big)).size < big.size)
        assertEquals(3, FlightFiles.bounded(ByteArrayInputStream(byteArrayOf(1, 2, 3))).size)
    }
}
