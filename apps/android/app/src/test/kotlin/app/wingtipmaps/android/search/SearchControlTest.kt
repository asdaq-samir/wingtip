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

    /** An Add opens the search to keep what is picked, in its own words,
     *  and the search let go forgets it (the web's pickAirplane). */
    @Test
    fun anAddOpensTheSearchToKeepAnAirplane() {
        val control = SearchControl()
        control.keep(SearchControl.Keep.Mine)
        assertEquals(SearchControl.Keep.Mine, control.keeping)
        assertEquals(1, control.asked)
        control.done()
        assertNull(control.keeping)
    }

    /** What a pick is kept by: an airplane by its N-number or its type, one
     *  heard only by a registration that is an N-number. */
    @Test
    fun aPickIsKeptByItsNumberOrType() {
        assertEquals("N12345", KeepPick.keyOf(SearchPick.Airplane("N12345", null, "N12345"))?.ident)
        assertEquals(Remembered(Remembered.Kind.AIRPLANE, "C172", type = "c172"), KeepPick.keyOf(SearchPick.Airplane(null, "c172", "C172")))
        assertEquals("N501SK", KeepPick.keyOf(SearchPick.Traffic("a1b2c3", "N501-SK"))?.ident)
        assertNull(KeepPick.keyOf(SearchPick.Traffic("a1b2c3", "G-ABCD")))
        assertNull(KeepPick.keyOf(SearchPick.Traffic("a1b2c3")))
    }
}
