package app.wingtipmaps.android.flight

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The glide ring off by default and on in an emergency (the owner,
 *  2026-11-09), and each airplane's own glide ratio read off the
 *  planner's profiles, none assumed for one without. */
class GlideRingTest {
    @Test
    fun theRingIsOffUnlessKeptOnOrInAnEmergency() {
        assertFalse(GlideRing.shown(kept = false, emergencyOpen = false))
        assertTrue(GlideRing.shown(kept = false, emergencyOpen = true))
        assertTrue(GlideRing.shown(kept = true, emergencyOpen = false))
    }

    @Test
    fun eachProfilesGlideIsItsOwnAndNoneIsGuessed() {
        // The c172's 9 to 1 (its POH, figure 3-1); the pa28 has none.
        val body = """{"profiles":[{"name":"c172","glide":{"best_glide_kias":68,"ratio":9,"source":"POH"}},{"name":"pa28"}]}"""
        assertEquals(mapOf("c172" to 9.0), AirplaneGlide.read(body))
    }
}
