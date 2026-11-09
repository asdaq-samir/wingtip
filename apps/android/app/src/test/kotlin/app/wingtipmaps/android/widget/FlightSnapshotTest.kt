package app.wingtipmaps.android.widget

import app.wingtipmaps.android.Plan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The Next Flight widget's snapshot and words, as the iPhone's
 *  WidgetSnapshot tests hold its own: nothing without a route, and no
 *  time or fuel without an airplane (decision 0011). */
class FlightSnapshotTest {
    @Test
    fun nothingWithoutARoute() {
        assertNull(FlightSnapshot.of(Plan.State(dep = "C81"), 0L))
    }

    @Test
    fun aRouteWithNoLogYetHasItsEndsAlone() {
        val s = FlightSnapshot.of(Plan.State(dep = "C81", dest = "KDLH", stops = listOf("KRST")), 0L)!!
        assertEquals("C81 → KDLH · 1 stop", s.route)
        assertEquals("—", s.figures)
        assertNull(s.eteMin)
        assertNull(s.fuelGal)
    }

    @Test
    fun theFiguresTheLogHas() {
        val s = FlightSnapshot(dep = "C81", dest = "KDLH", distanceNm = 102.4, eteMin = 65.0, fuelGal = 18.4, updatedAtMs = 0L)
        assertEquals("C81 → KDLH", s.route)
        assertEquals("102.4 nm · 1h 5m · 18.4 gal", s.figures)
        assertEquals("102.4 nm", s.copy(eteMin = null, fuelGal = null).figures)
    }
}
