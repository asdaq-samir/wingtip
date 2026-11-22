package app.wingtipmaps.android.flight

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The strip's Track in degrees magnetic, the engine's on the route or the
 *  fix's true course less the variation, none below flying speed or with
 *  no course; and the GPS height to the nearest 10 ft. */
class StripTrackTest {
    private fun fix(trackDeg: Double?) = OwnShip.Fix(lat = 42.0, lon = -88.0, altitudeFt = 1234.0, trackDeg = trackDeg, groundspeedKt = 100.0, accuracyM = 5.0, atMs = 0)

    @Test
    fun theEnginesMagneticTrackOnTheRouteElseTheTrueLessTheVariation() {
        assertEquals(272.0, StripTrack.of(fix(270.0), underway = true, magneticDeg = 272.0)!!, 1e-9)
        // East is least: 4 degrees west of north is 356 magnetic with 4 E.
        assertEquals(356.0, StripTrack.of(fix(0.0), underway = true, magneticDeg = null) { _, _ -> 4.0 }!!, 1e-9)
        assertEquals(5.0, StripTrack.of(fix(1.0), underway = true, magneticDeg = null) { _, _ -> -4.0 }!!, 1e-9)
    }

    @Test
    fun noTrackWithoutACourseOrBelowFlyingSpeed() {
        assertNull(StripTrack.of(null, underway = true, magneticDeg = 90.0))
        assertNull(StripTrack.of(fix(null), underway = true, magneticDeg = 90.0))
        assertNull(StripTrack.of(fix(90.0), underway = false, magneticDeg = 90.0))
        assertNull(StripTrack.of(fix(90.0), underway = true, magneticDeg = null) { _, _ -> null })
    }

    @Test
    fun theGpsHeightToTheNearestTen() {
        assertEquals(1230.0, StripTrack.tens(1234.0), 0.0)
        assertEquals(1240.0, StripTrack.tens(1235.0), 0.0)
    }
}
