package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.CourseEnd
import app.wingtipmaps.android.route.PointActions.Action
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A route point's menu in the iPhone's order and words, the edits it
 *  makes (Move, Add a Stop After) and the one step back its Undo takes. */
class PointActionsTest {
    private val dep = CourseEnd(ident = "KDPA", lat = 41.9, lon = -88.2, name = "Dupage")
    private val jvl = CourseEnd(ident = "KJVL", lat = 42.6, lon = -89.0, name = "Janesville")
    private val rfd = CourseEnd(ident = "KRFD", lat = 42.2, lon = -89.1, name = "Rockford")
    private val dest = CourseEnd(ident = "KMSN", lat = 43.1, lon = -89.3, name = "Madison")
    private val course = Course(
        bearingDeg = 320.0, chartCycle = "c", chartLayers = emptyList(), courseLine = emptyList(), departure = dep, destination = dest,
        distanceNm = 90.0, maxZoom = 12, minZoom = 5, stops = listOf(jvl, rfd),
    )
    private val state = Plan.State(dep = "KDPA", dest = "KMSN", stops = listOf("KJVL", "KRFD"), course = course)

    @Test
    fun eachPointHasItsActionsInOneOrder() {
        assertEquals(
            listOf(Action.MORE_INFO, Action.DIRECT_TO, Action.HOLD_HERE, Action.ADD_STOP_AFTER, Action.MOVE_DOWN, Action.REMOVE),
            PointActions.of("KJVL", state),
        )
        assertEquals(
            listOf(Action.MORE_INFO, Action.DIRECT_TO, Action.HOLD_HERE, Action.ADD_STOP_AFTER, Action.MOVE_UP, Action.REMOVE),
            PointActions.of("RFD", state),
        )
        // The destination's Brief beside its card; nothing added after it.
        assertEquals(listOf(Action.MORE_INFO, Action.BRIEF, Action.DIRECT_TO, Action.HOLD_HERE), PointActions.of("KMSN", state))
        // The departure is not flown to; a stop can follow it.
        assertEquals(listOf(Action.MORE_INFO, Action.HOLD_HERE, Action.ADD_STOP_AFTER), PointActions.of("KDPA", state))
        // A point of the log that is none of the route's has no menu.
        assertEquals(emptyList<Action>(), PointActions.of("VPBNG", state))
    }

    @Test
    fun holdHereOnlyWhereTheCourseHasThePoint() {
        assertFalse(Action.HOLD_HERE in PointActions.of("KJVL", state.copy(course = null)))
        assertEquals(Plan.ChartPoint("KJVL", 42.6, -89.0), PointActions.chartPoint("JVL", state))
        assertNull(PointActions.chartPoint("KJVL", state.copy(course = null)))
    }

    @Test
    fun directToReadsFlyAsPlannedOnceFlownDirect() {
        assertTrue(PointActions.directOn("KRFD", state.copy(direct = "KRFD")))
        assertFalse(PointActions.directOn("KRFD", state))
    }

    @Test
    fun moveAndAddAStopAfter() {
        val stops = listOf("KJVL", "KRFD", "KEFT")
        assertEquals(listOf("KRFD", "KJVL", "KEFT"), RouteEdits.moved(stops, "RFD", -1))
        assertEquals(listOf("KJVL", "KEFT", "KRFD"), RouteEdits.moved(stops, "KRFD", 1))
        assertNull("not past the first", RouteEdits.moved(stops, "KJVL", -1))
        assertNull("not a stop", RouteEdits.moved(stops, "KMSN", 1))
        val route = RouteEdits.Route("KDPA", listOf("KJVL"), "KMSN")
        assertEquals(listOf("KC09", "KJVL"), RouteEdits.insertedAfter(route, "DPA", " kc09 "))
        assertEquals(listOf("KJVL", "KC09"), RouteEdits.insertedAfter(route, "KJVL", "KC09"))
        assertNull("nothing after the destination", RouteEdits.insertedAfter(route, "KMSN", "KC09"))
        assertNull("nothing typed", RouteEdits.insertedAfter(route, "KJVL", "  "))
    }

    @Test
    fun undoKeepsOneStepUntilItsTimeIsUp() {
        val undo = RouteUndo()
        val before = RouteEdits.Route("KDPA", listOf("KJVL"), "KMSN")
        undo.took(RouteUndo.Kind.REMOVED, "KJVL", before, listOf("KJVL/090/1:270:R:1M:2T"), direct = null, was = null)
        val first = undo.note.value!!
        undo.took(RouteUndo.Kind.MOVED, "KRFD", before, emptyList(), direct = null, was = null)
        // The first row's time up does not take the newer edit away.
        undo.dismiss(first.id)
        assertEquals(RouteUndo.Kind.MOVED, undo.note.value?.kind)
        val taken = undo.take()!!
        assertEquals(before, taken.route)
        assertNull(undo.note.value)
        assertNull(undo.take())
        undo.took(RouteUndo.Kind.DIRECT, "KMSN", before, emptyList(), direct = null, was = null)
        undo.dismiss(undo.note.value!!.id)
        assertNull(undo.note.value)
    }
}
