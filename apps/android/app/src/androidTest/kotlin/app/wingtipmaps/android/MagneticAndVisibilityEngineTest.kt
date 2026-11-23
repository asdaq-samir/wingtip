package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.flight.StripTrack
import app.wingtipmaps.android.format.Format
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * True to magnetic and a reported visibility through this app's own
 * bridge, the engine's magnetic_of and visibility_reportable, which a JVM
 * unit test cannot load: the strip's track and Format's visibility.
 */
@RunWith(AndroidJUnit4::class)
class MagneticAndVisibilityEngineTest {
    private fun fix(trackDeg: Double) = OwnShip.Fix(lat = 42.0, lon = -88.0, altitudeFt = 1234.0, trackDeg = trackDeg, groundspeedKt = 100.0, accuracyM = 5.0, atMs = 0)

    /** East is least, west is best (FAA-H-8083-25C, ch. 16). */
    @Test
    fun theStripsTrackIsTheTrueLessTheVariation() {
        assertEquals(356.0, StripTrack.of(fix(0.0), underway = true, magneticDeg = null) { _, _ -> 4.0 }!!, 1e-9)
        assertEquals(5.0, StripTrack.of(fix(1.0), underway = true, magneticDeg = null) { _, _ -> -4.0 }!!, 1e-9)
    }

    /** The reportable value at or below, FMH-1 Table 6-1: never rounded
     *  up (5/8 was ".63 sm"), and no 11/16, which no report writes. */
    @Test
    fun aVisibilityIsTheReportableOneBelowIt() {
        assertEquals("2½ sm", Format.visibility(2.5))
        assertEquals("¾ sm", Format.visibility(0.75))
        assertEquals("5/8 sm", Format.visibility(0.625))
        assertEquals("1 3/8 sm", Format.visibility(1.375))
        assertEquals(0 to "5/8", Format.reportedVisibility(0.7456))
        assertEquals(4 to null, Format.reportedVisibility(4.97))
    }
}
