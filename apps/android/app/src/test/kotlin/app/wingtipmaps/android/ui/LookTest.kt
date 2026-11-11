package app.wingtipmaps.android.ui

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipPalettes
import app.wingtipmaps.android.design.generated.nativePalette
import app.wingtipmaps.android.flight.Geo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.hypot

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
    fun nativeIsMaterialsOwnSchemeAndKeepsTheStates() {
        for (dark in listOf(false, true)) {
            // Material's baseline, the scheme before Android 12; Material
            // You's from the wallpaper has its surfaces at the same tones.
            val scheme = if (dark) darkColorScheme() else lightColorScheme()
            val native = nativePalette(scheme, dark)
            val theme = Look.WINGTIP.palette(dark)
            assertEquals(scheme.primary, native.tint)
            assertEquals(scheme.onSurface, native.foreground)
            assertEquals(scheme.surface, native.sheet)
            // The states and the course are aviation's, the same in every look.
            assertEquals(theme.caution, native.caution)
            assertEquals(theme.goInk, native.goInk)
            assertEquals(theme.destructiveInk, native.destructiveInk)
            assertEquals(theme.course, native.course)
            // Their words 4.5:1 and more on Material's grounds (WCAG 1.4.3).
            for (ground in listOf(scheme.surface, scheme.background, scheme.surfaceContainerLow)) {
                for (words in listOf(native.cautionInk, native.goInk, native.destructiveInk, native.caution)) {
                    val ratio = contrast(words, ground)
                    assertTrue("dark=$dark $ratio:1", ratio >= 4.5)
                }
            }
        }
        assertEquals(Look.NATIVE, Look.of("native"))
    }

    @Test
    fun aPointGoesWhereItBendsTheRouteLeast() {
        // Chicago to Milwaukee to Green Bay: a point near Milwaukee's south
        // goes on the first leg, one past it to the north on the second.
        // The distances are the engine's on the phone; here, a flat
        // chart's, near enough over a few degrees to place a point.
        val flat = Geo.Distance { lat1, lon1, lat2, lon2 -> Result.success(hypot(lat2 - lat1, (lon2 - lon1) * 0.73) * 60) }
        val route = listOf(41.98 to -87.90, 42.95 to -87.90, 44.48 to -88.13)
        assertEquals(0, Geo.bestStopIndex(route, 42.5, -87.9, flat).getOrThrow())
        assertEquals(1, Geo.bestStopIndex(route, 43.8, -88.0, flat).getOrThrow())
        // A distance the engine could not give places it nowhere.
        val failing = Geo.Distance { _, _, _, _ -> Result.failure(IllegalStateException("no engine")) }
        assertTrue(Geo.bestStopIndex(route, 42.5, -87.9, failing).isFailure)
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
