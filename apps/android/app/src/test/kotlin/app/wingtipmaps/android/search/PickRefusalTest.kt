package app.wingtipmaps.android.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** While the one search picks a point, a field it cannot take and why:
 *  closed (decision 0043), or for Add a Stop already on the route;
 *  outside a pick, nothing is refused. */
class PickRefusalTest {
    private val route = listOf("C81", "KJVL", "KDLH")

    @Test
    fun aClosedFieldIsNeverPicked() {
        assertEquals(PickRefusal.Why.CLOSED, PickRefusal.of(picking = true, addingStop = false, ident = "IL11", closed = "Closed indefinitely", route = route))
        assertEquals(PickRefusal.Why.CLOSED, PickRefusal.of(picking = false, addingStop = true, ident = "IL11", closed = "Closed permanently", route = route))
    }

    @Test
    fun aStopTheRouteHasIsNotAddedAgain() {
        assertEquals(PickRefusal.Why.ON_ROUTE, PickRefusal.of(picking = false, addingStop = true, ident = "kjvl", closed = null, route = route))
        // An end asked for may be a field the route has (a round trip).
        assertNull(PickRefusal.of(picking = true, addingStop = false, ident = "C81", closed = null, route = route))
    }

    @Test
    fun outsideAPickNothingIsRefused() {
        assertNull(PickRefusal.of(picking = false, addingStop = false, ident = "IL11", closed = "Closed indefinitely", route = route))
        assertNull(PickRefusal.of(picking = false, addingStop = true, ident = "KMSN", closed = " ", route = route))
    }
}
