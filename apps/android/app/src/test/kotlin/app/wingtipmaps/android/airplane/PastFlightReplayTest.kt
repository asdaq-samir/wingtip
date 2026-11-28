package app.wingtipmaps.android.airplane

import app.wingtipmaps.android.api.generated.PastFlightPoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A past flight played on the planner's ready points, none worked out again on the phone. */
class PastFlightReplayTest {
    private fun p(t: Double, lat: Double, alt: Double?, gap: Boolean = false, ground: Boolean = false, vs: Double? = null) =
        PastFlightPoint(t = t, lat = lat, lon = -92.0, altFt = alt, gap = gap, ground = ground, vsFpm = vs)

    @Test
    fun betweenTwoReportsItMovesInProportion() {
        val fix = PastFlightReplay.between(listOf(p(0.0, 46.0, 3000.0), p(10.0, 46.1, 3500.0)), 0, 5.0)!!
        assertEquals(46.05, fix.lat, 1e-9)
        assertEquals(3250.0, fix.altitudeFt!!, 1e-9)
    }

    @Test
    fun acrossAGapItIsHeldWhereItWasLastHeard() {
        // Nothing known across a hole of no report (replay_track's gap): no line drawn through it.
        val fix = PastFlightReplay.between(listOf(p(0.0, 46.0, 3000.0), p(600.0, 47.0, 5000.0, gap = true)), 0, 300.0)!!
        assertEquals(46.0, fix.lat, 1e-9)
        assertEquals(3000.0, fix.altitudeFt!!, 1e-9)
    }

    @Test
    fun onTheGroundItHasNoHeightNeverZero() {
        val fix = PastFlightReplay.between(listOf(p(0.0, 46.0, null, ground = true), p(10.0, 46.001, 1200.0)), 0, 5.0)!!
        assertNull(fix.altitudeFt)
    }

    @Test
    fun theClimbIsSaidToTheFiftyFeetAMinute() {
        assertEquals("↑ 650 fpm", PastFlightReplay.climbWords(640.0))
        assertEquals("↓ 300 fpm", PastFlightReplay.climbWords(-310.0))
        assertEquals("level", PastFlightReplay.climbWords(60.0))
        assertNull(PastFlightReplay.climbWords(null))
    }
}
