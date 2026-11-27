package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.Pilot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Map card's Appearance (the web's three since 2026-11-18), the
 *  chart's Dimmer and Contrast (ChartLook), and You's head. */
class AppearanceTest {
    @Test
    fun theAppearanceIsTheScreensAloneAndDarkPlusBrightIsGone() {
        assertTrue(Appearance.SYSTEM.dark(systemDark = true))
        assertFalse(Appearance.SYSTEM.dark(systemDark = false))
        assertFalse(Appearance.LIGHT.dark(systemDark = true))
        assertTrue(Appearance.DARK.dark(systemDark = false))
        assertEquals(listOf(Appearance.SYSTEM, Appearance.LIGHT, Appearance.DARK), Appearance.entries)
        assertEquals(Appearance.SYSTEM, Appearance.of(null))
    }

    @Test
    fun theDimmerIsKeptForEachAppearanceWithinItsEnds() {
        // The web's defaults (lib/map/chartLook): none by day, half at night.
        val look = ChartLook()
        assertEquals(0f, look.dim(dark = false))
        assertEquals(0.5f, look.dim(dark = true))
        // Never past the deepest dim; the Contrast within its ends.
        assertEquals(ChartLook.DIM_MAX, ChartLook(dimDark = 0.9f).dim(dark = true))
        assertEquals(ChartLook.CONTRAST_MAX, ChartLook(contrast = 0.9f).offset)
        // On the night's own paint: half as bright by default, the offset on its contrast.
        val night = ChartLook(contrast = 0.1f).paint(night = true)
        assertEquals(0.5f, night.brightnessMax)
        assertEquals(0.23f, night.contrast, 1e-6f)
        assertEquals(1f, ChartLook().paint(night = false).brightnessMax)
    }

    @Test
    fun youNeverTakesAnAddressForTheName() {
        fun pilot(displayName: String, fullName: String? = null) =
            Pilot(id = 1, email = "pat@example.com", displayName = displayName, fullName = fullName, developer = false)
        assertNull(YouName.of(pilot("pat@example.com")))
        assertNull(YouName.of(null))
        assertEquals("Pat Doe", YouName.of(pilot("pat@example.com", fullName = "Pat Doe")))
        assertEquals("Pat", YouName.of(pilot("Pat")))
    }
}
