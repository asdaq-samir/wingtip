package app.wingtipmaps.android.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import app.wingtipmaps.android.design.generated.WingtipPalettes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Wingtip look's Material scheme (the owner's decision, 2026-11-10,
 * on the Android sheet audit's L-1 and L-2): the surface containers step
 * from lowest to highest, the outline stands 3:1 off the sheet (WCAG
 * 1.4.11, a control's edge), the search bar's grey words read at 4.5:1
 * (WCAG 1.4.3), and at night primary is the night tint #57A8FF.
 */
class WingtipSchemeTest {
    private fun contrast(a: Color, b: Color): Double {
        val (hi, lo) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun scheme(dark: Boolean): ColorScheme = Look.WINGTIP.palette(dark).materialScheme(dark)

    @Test
    fun theContainersStepFromLowestToHighest() {
        for (dark in listOf(false, true)) {
            val s = scheme(dark)
            val steps = listOf(s.surfaceContainerLowest, s.surfaceContainerLow, s.surfaceContainer, s.surfaceContainerHigh, s.surfaceContainerHighest)
            assertEquals("five distinct steps, dark=$dark", 5, steps.toSet().size)
            // Away from the ground: lighter to darker by day, darker to lighter at night.
            val lum = steps.map { it.luminance() }
            assertTrue("in order, dark=$dark", lum.zipWithNext().all { (a, b) -> if (dark) b > a else b < a })
        }
    }

    @Test
    fun theOutlineStandsOffTheSheetAtThreeToOne() {
        for (dark in listOf(false, true)) {
            val s = scheme(dark)
            assertTrue("outline on the sheet, dark=$dark", contrast(s.outline, s.surfaceContainerLow) >= 3.0)
        }
    }

    @Test
    fun theSearchBarsGreyWordsReadAtFourAndAHalf() {
        for (dark in listOf(false, true)) {
            val s = scheme(dark)
            assertTrue("placeholder on the bar, dark=$dark", contrast(s.onSurfaceVariant, s.surfaceContainerHigh) >= 4.5)
        }
    }

    @Test
    fun atNightPrimaryIsTheNightTint() {
        val s = scheme(dark = true)
        assertEquals(WingtipPalettes.Dark.tint, s.primary)
        assertTrue(contrast(s.primary, s.surfaceContainerLow) >= 4.5)
        assertTrue(contrast(s.onPrimary, s.primary) >= 4.5)
    }
}
