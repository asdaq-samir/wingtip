package app.wingtipmaps.android.share

import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The nav log sent as text and printed: a line (a row) a leg in the
 *  nav log's order, its course where no airplane gives a heading, the
 *  totals last, and a printed page whose words cannot break its markup. */
class NavLogTextTest {
    private val legs = listOf(
        Leg(altitudeFt = 4500.0, distanceNm = 24.0, from = "C81", magneticCourseDeg = 318.0, magneticVariationDeg = -3.0, to = "KJVL", trueCourseDeg = 315.0, eteMin = 14.0, fuelGal = 2.1, magneticHeadingDeg = 320.0),
        Leg(altitudeFt = 4500.0, distanceNm = 30.0, from = "KJVL", magneticCourseDeg = 330.0, magneticVariationDeg = -3.0, to = "KMSN", trueCourseDeg = 327.0),
    )
    private val totals = NavLogTotals(distanceNm = 54.0, legsWithoutWind = 0, unflyableLegs = 0, eteMin = 32.0, fuelGal = 4.6)

    @Test
    fun aLineALegThenTheTotals() {
        val lines = NavLogText.text("C81 → KMSN", legs, totals).lines()
        assertEquals("C81 → KMSN", lines[0])
        assertTrue(lines[1], lines[1].startsWith("KJVL  FL-045  24.0 nm  MH 320°"))
        assertTrue(lines[2], lines[2].contains("MC 330°"))
        assertTrue(lines[3], lines[3].startsWith("Total  54.0 nm"))
    }

    @Test
    fun thePrintedPageEscapesItsWords() {
        val page = NavLogText.html("A<B", legs, null)
        assertTrue(page.contains("<h1>A&lt;B</h1>"))
        assertEquals(3, Regex("<tr>").findAll(page).count())
    }
}
