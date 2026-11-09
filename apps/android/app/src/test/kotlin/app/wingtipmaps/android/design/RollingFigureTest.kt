package app.wingtipmaps.android.design

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which way a figure rolls: by its digits, up as it grows and down as
 *  it counts down; up where there are no digits to compare. */
class RollingFigureTest {
    @Test
    fun countingDownRollsDown() {
        assertFalse(rollsUp("1h 05m", "1h 04m"))
        assertFalse(rollsUp("20.0 nm", "19.9 nm"))
    }

    @Test
    fun growingRollsUp() {
        assertTrue(rollsUp("4,500", "4,600"))
        assertTrue(rollsUp("19", "20"))
    }

    @Test
    fun noDigitsRollUp() {
        assertTrue(rollsUp("—", "12m"))
        assertTrue(rollsUp("12m", "—"))
    }
}
