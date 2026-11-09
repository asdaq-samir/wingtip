package app.wingtipmaps.android.flight

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The glide ring off by default and on in an emergency (the owner,
 *  2026-11-09), and its switch unavailable, with why, with no airplane or
 *  none of its own glide ratio. */
class GlideRingTest {
    @Test
    fun theRingIsOffUnlessKeptOnOrInAnEmergency() {
        assertFalse(GlideRing.shown(kept = false, emergencyOpen = false))
        assertTrue(GlideRing.shown(kept = false, emergencyOpen = true))
        assertTrue(GlideRing.shown(kept = true, emergencyOpen = false))
    }

    @Test
    fun theSwitchSaysWhyItCannotDrawARing() {
        assertEquals(GlideRing.Unavailable.NO_AIRPLANE, GlideRing.unavailable(airplane = false, glideRatio = null))
        // An airplane without its own glide ratio: none is taken from another.
        assertEquals(GlideRing.Unavailable.NO_GLIDE, GlideRing.unavailable(airplane = true, glideRatio = null))
        assertNull(GlideRing.unavailable(airplane = true, glideRatio = 9.0))
    }
}
