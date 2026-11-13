package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Clear Route's rules: what has something to clear, and where the empty
 *  plan's ✕ goes after it -- the card of the field Fly Here flew to, once,
 *  else the search (the web's clearRoute). */
class ClearRouteTest {
    @Test
    fun anEndOrAStopIsSomethingToClear() {
        assertFalse(Plan.State().hasPoints)
        assertTrue(Plan.State(dep = "KMSN").hasPoints)
        assertTrue(Plan.State(dest = "KOSH").hasPoints)
        assertTrue(Plan.State(stops = listOf("KJVL")).hasPoints)
    }

    @Test
    fun aRouteFlownToAFieldClearedGoesBackToItsCardOnce() {
        val home = RouteHome()
        home.flewTo("kosh")
        home.cleared("KOSH")
        assertEquals("KOSH", home.backTo(hasPoints = false))
        assertNull(home.backTo(hasPoints = false))
    }

    @Test
    fun aRouteToAnotherFieldClearedGoesBackToTheSearch() {
        val home = RouteHome()
        home.flewTo("KOSH")
        home.cleared("KJVL")
        assertNull(home.backTo(hasPoints = false))
    }

    @Test
    fun aRouteNeverFlownToFromACardGoesBackToTheSearch() {
        val home = RouteHome()
        home.cleared("KOSH")
        assertNull(home.backTo(hasPoints = false))
    }

    @Test
    fun aPlanWithARouteClosesToTheSearchAndKeepsTheCardForLater() {
        val home = RouteHome()
        home.flewTo("KOSH")
        home.cleared("KOSH")
        // Undone, the route is back: its ✕ shows the search, the route kept.
        assertNull(home.backTo(hasPoints = true))
        assertEquals("KOSH", home.backTo(hasPoints = false))
    }
}
