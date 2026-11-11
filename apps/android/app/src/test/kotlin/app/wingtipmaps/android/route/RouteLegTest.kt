package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.CourseEnd
import app.wingtipmaps.android.api.Leg
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The route's line cut into its legs for the map, the Route Leg sheet's
 *  view of a leg, and its Direct and Remove, as the web's useLegSheet and
 *  planAddress have them. */
class RouteLegTest {
    private val dep = CourseEnd(ident = "KDPA", lat = 41.9, lon = -88.2, name = "Dupage")
    private val stop = CourseEnd(ident = "KJVL", lat = 42.6, lon = -89.0, name = "Janesville")
    private val dest = CourseEnd(ident = "KMSN", lat = 43.1, lon = -89.3, name = "Madison")
    private val line = listOf(listOf(41.9, -88.2), listOf(42.2, -88.6), listOf(42.6, -89.0), listOf(42.9, -89.2), listOf(43.1, -89.3))
    private val course = Course(
        bearingDeg = 320.0, chartCycle = "c", chartLayers = emptyList(), courseLine = line, departure = dep, destination = dest,
        distanceNm = 90.0, maxZoom = 12, minZoom = 5, stops = listOf(stop),
    )

    private fun leg(from: String, to: String, nm: Double, mc: Double) =
        Leg(altitudeFt = 4500.0, distanceNm = nm, from = from, magneticCourseDeg = mc, magneticVariationDeg = -3.0, to = to, trueCourseDeg = mc - 3)

    @Test
    fun theLineIsCutAtEachPoint() {
        val legs = RouteLegs.cut(line, RoutePoints.of(course))
        assertEquals(2, legs.size)
        assertEquals(line.subList(0, 3), legs[0])
        assertEquals(line.subList(2, 5), legs[1])
        val features = Json.parseToJsonElement(RouteLegs.json(legs)).jsonObject["features"]!!.jsonArray
        assertEquals(listOf(0, 1), features.map { it.jsonObject["properties"]!!.jsonObject[RouteLegs.LEG]!!.jsonPrimitive.int })
        // Longitude first, as GeoJSON has it.
        assertEquals(-88.2, features[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray[0].jsonArray[0].jsonPrimitive.content.toDouble(), 0.0)
    }

    @Test
    fun aLegsSheetHasItsEndsFiguresAndActions() {
        val plan = Plan.State(dep = "KDPA", dest = "KMSN", stops = listOf("KJVL"), course = course, legs = listOf(leg("KDPA", "KJVL", 48.2, 312.0), leg("KJVL", "KMSN", 41.0, 338.0)))
        val first = RouteLegModel.view(0, plan, flyingTo = "KJVL")!!
        assertEquals("KDPA", first.from)
        assertEquals("KJVL", first.to)
        assertEquals(48.2, first.distanceNm!!, 0.0)
        assertEquals(312.0, first.courseMagDeg!!, 0.0)
        assertTrue(first.active)
        assertTrue("its end is a stop", first.removable)
        val second = RouteLegModel.view(1, plan, flyingTo = null)!!
        assertFalse("the destination is not removed", second.removable)
        assertFalse(second.active)
        assertNull(RouteLegModel.view(2, plan, null))
        assertTrue(RouteLegModel.view(1, plan.copy(direct = "KMSN"), null)!!.directOn)
    }

    @Test
    fun directAndRemoveAsTheWebHasThem() {
        val was = RouteEdits.Route("KDPA", listOf("KJVL", "KRFD"), "KMSN")
        assertEquals(RouteEdits.Route("@42.0000,-88.5000", listOf("KRFD"), "KMSN"), RouteEdits.direct(was, "KRFD", "@42.0000,-88.5000"))
        assertEquals(RouteEdits.Route("KDPA", emptyList(), "KMSN"), RouteEdits.direct(was, "MSN", null))
        assertNull(RouteEdits.direct(was, "KORD", null))
        assertEquals(listOf("KRFD"), RouteEdits.without(was.stops, "JVL"))
    }
}
