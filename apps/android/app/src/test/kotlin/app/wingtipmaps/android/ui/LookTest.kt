package app.wingtipmaps.android.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.flight.Geo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pieces of the look and the sheet that hold without a screen. */
class LookTest {
    private fun contrast(a: Color, b: Color): Double {
        val (hi, lo) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    @Test
    fun everyCategoryChipCarriesWhiteWordsAtFourAndAHalfToOne() {
        for (category in listOf("VFR", "MVFR", "IFR", "LIFR")) {
            val ratio = contrast(FlightCategory.chip(category), Color.White)
            assertTrue("$category chip $ratio:1", ratio >= 4.5)
        }
        assertEquals(WingtipColors.Category.LifrChip, FlightCategory.chip("lifr"))
        assertEquals(WingtipColors.Category.Lifr, FlightCategory.mark("LIFR"))
    }

    @Test
    fun wingtipIsTheDefaultLookAndItsTintIsTheBrandBlue() {
        assertEquals(Look.WINGTIP, Look.of(null))
        assertEquals(Look.INK, Look.of("ink"))
        assertEquals(Color(0xFF0066CC), Look.WINGTIP.palette(dark = false).tint)
        // A look with no inks of its own takes Chart ink's.
        assertEquals(WingtipPalettes.InkLight.inkBrown, InkColors.of(WingtipPalettes.Light, dark = false).brown)
    }

    @Test
    fun aPointGoesWhereItBendsTheRouteLeast() {
        // Chicago to Milwaukee to Green Bay: a point near Milwaukee's south
        // goes on the first leg, one past it to the north on the second.
        val route = listOf(41.98 to -87.90, 42.95 to -87.90, 44.48 to -88.13)
        assertEquals(0, Geo.bestStopIndex(route, 42.5, -87.9))
        assertEquals(1, Geo.bestStopIndex(route, 43.8, -88.0))
    }

    @Test
    fun theAirplanesPlaceIsWrittenAsThePlannerReadsOne() {
        val fix = app.wingtipmaps.android.flight.OwnShip.Fix(
            lat = 41.88, lon = -87.63, altitudeFt = 4512.0, trackDeg = null, groundspeedKt = null,
            accuracyM = 5.0, atMs = 0L,
        )
        assertEquals("@41.8800,-87.6300,4500", Plan.positionIdent(fix))
    }
}
