package app.wingtipmaps.android.brief

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.generated.IcingForecast
import app.wingtipmaps.android.api.generated.IcingForecastLeg
import app.wingtipmaps.android.api.generated.IcingLayer
import app.wingtipmaps.android.route.RoutePoint
import app.wingtipmaps.android.strip.Finding
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The Brief's forecast icing: asked with the nav log's fixes and legs
 *  as the web asks it, and each leg's row in the web's words. */
class IcingModelTest {
    @get:Rule val main = MainRule()

    private val points = listOf(RoutePoint("KDPA", "Dupage", 41.9, -88.25), RoutePoint("KMSN", "Madison", 43.14, -89.34), RoutePoint("KDLH", "Duluth", 46.84, -92.19))

    private fun leg(from: String, to: String, ete: Double?) =
        Leg(altitudeFt = 6500.0, distanceNm = 100.0, from = from, magneticCourseDeg = 330.0, magneticVariationDeg = -3.0, to = to, trueCourseDeg = 327.0, eteMin = ete, groundMin = 30.0)

    @Test
    fun eachLegIsAskedAndSaid() {
        var asked: List<String>? = null
        val model = IcingModel { f, a, l, g ->
            asked = listOf(f, a, l, g)
            IcingForecast(
                issued = "2026-11-09T14:00:00Z",
                legs = listOf(
                    IcingForecastLeg(altitudeFt = 6500.0, index = 0, layer = IcingLayer(bottomFt = 3000.0, topFt = 9000.0), severity = "light", share = 0.4),
                    IcingForecastLeg(altitudeFt = 6500.0, index = 1, severity = null),
                ),
                unchecked = emptyList(),
            )
        }
        model.brief(points, listOf(leg("KDPA", "KMSN", 52.0), leg("KMSN", "KDLH", 95.5)))
        assertEquals(listOf("41.90000,-88.25000;43.14000,-89.34000;46.84000,-92.19000", "6500,6500", "52.0,95.5", "30,30"), asked)
        val rows = model.state.value.rows
        assertEquals("KDPA → KMSN", rows[0].title)
        assertEquals("Light at 6,500 ft, 40% of it", rows[0].value)
        assertEquals("Icing forecast 3,000–9,000 ft", rows[0].layer)
        assertEquals(Finding.CAUTION, rows[0].finding)
        assertEquals("No forecast at 6,500 ft", rows[1].value)
        assertNull(rows[1].layer)
        assertEquals(Finding.UNKNOWN, rows[1].finding)
        assertTrue(model.state.value.credit!!.startsWith("AWC CIP and FIP, issued "))
    }

    @Test
    fun withNoAirplaneNothingIsAsked() {
        var asked = false
        val model = IcingModel { _, _, _, _ -> asked = true; error("not asked") }
        // No airplane: the planner sends no leg times (decision 0011).
        model.brief(points, listOf(leg("KDPA", "KMSN", null), leg("KMSN", "KDLH", null)))
        assertEquals(false, asked)
        assertTrue(model.state.value.rows.isEmpty())
    }

    @Test
    fun aForecastThatFailsIsSaid() {
        val model = IcingModel { _, _, _, _ -> throw java.io.IOException("down") }
        model.brief(points, listOf(leg("KDPA", "KMSN", 52.0), leg("KMSN", "KDLH", 95.5)))
        assertTrue(model.state.value.unchecked)
    }
}
