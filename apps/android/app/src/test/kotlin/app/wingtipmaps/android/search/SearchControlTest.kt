package app.wingtipmaps.android.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The one search opened for a stop: after a point of the route (a point
 *  menu's Add a Stop After), with no field of its own. */
class SearchControlTest {
    @Test
    fun addAStopAfterAPointOpensTheSearchForIt() {
        val control = SearchControl()
        control.addStopAfter("KJVL")
        assertTrue(control.addingStop)
        assertEquals("KJVL", control.stopAfter)
        assertEquals(1, control.asked)
        control.done()
        assertFalse(control.addingStop)
        assertNull(control.stopAfter)
    }

    @Test
    fun theSearchOpenedPlainForgetsThePoint() {
        val control = SearchControl()
        control.addStopAfter("KJVL")
        control.open()
        assertFalse(control.addingStop)
        assertNull(control.stopAfter)
        control.addStop()
        assertTrue(control.addingStop)
        assertNull(control.stopAfter)
    }
}
