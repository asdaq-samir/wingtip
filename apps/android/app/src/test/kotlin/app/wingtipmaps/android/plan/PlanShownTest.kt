package app.wingtipmaps.android.plan

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.route.RouteEdits
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/** A re-plan that fails puts the plan shown before back whole: never the
 *  new route over the old legs (the offline audit's gap 3). */
class PlanShownTest {
    private fun leg(from: String, to: String) =
        Leg(altitudeFt = 4500.0, distanceNm = 20.0, from = from, magneticCourseDeg = 90.0, magneticVariationDeg = -3.0, to = to, trueCourseDeg = 87.0)

    private val planned = Plan.State(dep = "KMSN", dest = "KOSH", legs = listOf(leg("KMSN", "KOSH")), plannedAtMs = 1L)
    private val shown = PlanShown.of(planned)

    @Test
    fun aDirectToWithNoConnectionLeavesTheRouteAsItWasAndSaysSo() {
        // Direct To asked: the route changed on the page, one new leg in
        // before the connection went.
        val asked = planned.copy(dep = "@43.1,-89.3", stops = listOf("KUNU"), direct = "KUNU", was = RouteEdits.Route("KMSN", emptyList(), "KOSH"), legs = listOf(leg("@43.1,-89.3", "KUNU")))
        val (back, reverted) = PlanShown.failed(asked, shown, IOException("no route to host"))
        assertTrue(reverted)
        assertEquals("KMSN", back.dep)
        assertTrue(back.stops.isEmpty())
        assertNull(back.direct)
        assertEquals(listOf("KOSH"), back.legs.map { it.to })
        assertEquals(PlanShown.NOT_CHANGED, back.problem)
    }

    @Test
    fun theKeptPlanReplannedAtLaunchWithNoConnectionStandsInSilence() {
        val (back, reverted) = PlanShown.failed(planned.copy(legs = emptyList()), shown, IOException("offline"))
        assertFalse(reverted)
        assertEquals(1, back.legs.size)
        assertNull(back.problem)
    }

    @Test
    fun aRefusedChangeIsSaidInThePlannersWordsAndTheRouteStays() {
        val (back, reverted) = PlanShown.failed(planned.copy(dest = "ZZZZ"), shown, Planner.Failure(422, "Unknown airport ZZZZ"))
        assertTrue(reverted)
        assertEquals("KOSH", back.dest)
        assertEquals("The route could not be changed: Unknown airport ZZZZ.", back.problem)
    }

    @Test
    fun withNothingPlannedBeforeTheRouteAskedStandsWithNoHalfLog() {
        val asked = Plan.State(dep = "KMSN", dest = "KOSH", legs = listOf(leg("KMSN", "KUNU")))
        val (back, reverted) = PlanShown.failed(asked, null, IOException("offline"))
        assertFalse(reverted)
        assertTrue(back.legs.isEmpty())
        assertEquals("The route could not be planned: there is no connection to Wingtip.", back.problem)
    }
}
