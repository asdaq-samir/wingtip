package app.wingtipmaps.android.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.luminance
import app.wingtipmaps.android.design.Haptics
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipTypography
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Native is Material out of the box (the owner, 2026-11-10: "Native
 * means how they come out of the box, look and behavior wise"): the
 * scheme as Material makes it, Material's own Typography() and Shapes(),
 * and none of the app's own haptics but a warning's.
 */
class NativeLookTest {
    private fun contrast(a: Color, b: Color): Double {
        val (hi, lo) = listOf(a.compositeOver(b).luminance(), b.luminance()).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    private fun baseline(dark: Boolean): ColorScheme = if (dark) darkColorScheme() else lightColorScheme()

    @Test
    fun nativeTakesMaterialsSchemeTypeAndShapesWhole() {
        for (dark in listOf(false, true)) {
            val scheme = baseline(dark)
            val theme = lookTheme(Look.NATIVE, dark, scheme)
            assertTrue(theme.native)
            assertSame(scheme, theme.colorScheme)
            assertEquals(Typography(), theme.typography)
            assertEquals(Shapes(), theme.shapes)
        }
    }

    @Test
    fun theBrandLooksKeepTheirOwnTypeAndShapes() {
        for (look in listOf(Look.WINGTIP, Look.COCKPIT, Look.INK)) {
            val theme = lookTheme(look, dark = false, nativeScheme = null)
            assertFalse(theme.native)
            assertSame(WingtipTypography, theme.typography)
            assertSame(WingtipShapes, theme.shapes)
            assertNotEquals(Shapes(), theme.shapes)
        }
    }

    @Test
    fun nativeAddsNoTapsOfItsOwn() {
        assertTrue(Haptics.felt(WingtipHaptic.DETENT, native = false))
        assertFalse(Haptics.felt(WingtipHaptic.DETENT, native = true))
    }

    /**
     * Material's own word and ground pairs, measured and not adjusted
     * (WCAG 2.2 1.4.3, 4.5:1 for words; 1.4.11, 3:1 for a field's edge).
     * Material's baseline passes every one; a wallpaper's scheme is
     * Material You's to make, held to the same tones by its own tonal
     * palettes, and is not recoloured here if a device's falls short.
     */
    @Test
    fun materialsBaselineWordsMeetWcagAsShipped() {
        for (dark in listOf(false, true)) {
            val s = baseline(dark)
            val words = listOf(
                "onSurface/surface" to contrast(s.onSurface, s.surface),
                "onSurfaceVariant/surface" to contrast(s.onSurfaceVariant, s.surface),
                "onSurfaceVariant/surfaceContainerHighest" to contrast(s.onSurfaceVariant, s.surfaceContainerHighest),
                "primary/surface" to contrast(s.primary, s.surface),
                "onPrimary/primary" to contrast(s.onPrimary, s.primary),
                "onSecondaryContainer/secondaryContainer" to contrast(s.onSecondaryContainer, s.secondaryContainer),
                "error/surface" to contrast(s.error, s.surface),
            )
            for ((pair, ratio) in words) {
                println("Native baseline dark=$dark $pair ${"%.2f".format(ratio)}:1")
                assertTrue("dark=$dark $pair $ratio:1", ratio >= 4.5)
            }
            val edge = contrast(s.outline, s.surface)
            println("Native baseline dark=$dark outline/surface ${"%.2f".format(edge)}:1")
            assertTrue("dark=$dark outline $edge:1", edge >= 3.0)
        }
    }
}
