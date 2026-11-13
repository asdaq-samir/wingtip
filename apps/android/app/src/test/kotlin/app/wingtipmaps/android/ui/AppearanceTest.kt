package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.Pilot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Settings' Appearance (the web's four, 2026-11-13) and You's head. */
class AppearanceTest {
    @Test
    fun darkDimsTheChartAndDarkPlusBrightKeepsItAsPrinted() {
        assertTrue(Appearance.SYSTEM.dark(systemDark = true))
        assertFalse(Appearance.SYSTEM.dark(systemDark = false))
        assertFalse(Appearance.LIGHT.dark(systemDark = true))
        assertTrue(Appearance.DARK.dark(systemDark = false))
        assertTrue(Appearance.DARK.chartDimmed(systemDark = false))
        assertTrue(Appearance.DARK_BRIGHT.dark(systemDark = false))
        assertFalse(Appearance.DARK_BRIGHT.chartDimmed(systemDark = true))
        // The phone's own dark dims the chart, the night's default.
        assertTrue(Appearance.SYSTEM.chartDimmed(systemDark = true))
        assertEquals(Appearance.SYSTEM, Appearance.of(null))
        assertEquals(Appearance.DARK_BRIGHT, Appearance.of("dark-bright"))
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
