package app.wingtipmaps.android

import app.wingtipmaps.android.flight.DeviceFix
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Own ship's altitude is height above mean sea level or none: the fix's
 *  ellipsoid height (Location.getAltitude) is never put in its place. */
class OwnShipAltitudeTest {
    @Test
    fun metresAboveSeaLevelInFeet() {
        // 1,000 m is 3,280.839895 ft (1 ft = 0.3048 m exactly).
        assertEquals(3280.839895, DeviceFix.mslFeet(1000.0)!!, 1e-6)
    }

    @Test
    fun noSeaLevelAltitudeIsNone() {
        assertNull(DeviceFix.mslFeet(null))
    }

    @Test
    fun selectionTakesMslOnlyWhenPresent() {
        assertEquals(3280.839895, DeviceFix.mslFeet(hasAltitude = true, hasMsl = true, mslMeters = 1000.0)!!, 1e-6)
        // An ellipsoid-only fix (no MSL) and a fix without any altitude give none.
        assertNull(DeviceFix.mslFeet(hasAltitude = true, hasMsl = false, mslMeters = 1000.0))
        assertNull(DeviceFix.mslFeet(hasAltitude = false, hasMsl = true, mslMeters = 1000.0))
    }
}
