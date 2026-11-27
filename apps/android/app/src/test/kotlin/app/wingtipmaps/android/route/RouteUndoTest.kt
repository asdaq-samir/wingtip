package app.wingtipmaps.android.route

import app.wingtipmaps.android.plan.PlanProcedures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which edits put up the Undo Snackbar -- only those that took something
 *  away, the web's planHistory since 2026-11-21 -- and the fuel set at the
 *  fields carried with each step, so Undo puts it back with the route. */
class RouteUndoTest {
    private val route = RouteEdits.Route("C81", listOf("KJVL"), "KDLH")

    @Test
    fun onlyAnEditThatTookSomethingAwayIsLoud() {
        val loud = RouteUndo.Kind.entries.filter { it.loud }.toSet()
        assertEquals(
            setOf(RouteUndo.Kind.REMOVED, RouteUndo.Kind.DIRECT, RouteUndo.Kind.FLY_HERE, RouteUndo.Kind.CLEARED, RouteUndo.Kind.REPLACED),
            loud,
        )
        assertFalse(RouteUndo.Kind.ADDED.loud)
        assertFalse(RouteUndo.Kind.MOVED.loud)
        assertFalse(RouteUndo.Kind.FUEL.loud)
    }

    @Test
    fun aStepKeepsTheFuelSetAtTheFields() {
        val undo = RouteUndo()
        undo.took(RouteUndo.Kind.FUEL, "C81", route, emptyList(), direct = null, was = null, tanks = mapOf("C81" to 20))
        val note = undo.take()!!
        assertEquals(mapOf("C81" to 20), note.tanks)
        assertEquals(RouteUndo.Kind.FUEL, note.kind)
        // Kept for Redo with what the Undo left, the fuel too.
        undo.keepRedo(note.copy(tanks = emptyMap()))
        assertTrue(undo.takeRedo()!!.tanks.isEmpty())
    }

    @Test
    fun aProcedureTakenOffIsALoudStepThatKeepsThePicks() {
        // Plan.removeProcedure: "ILS RWY 36 Removed", the picks before it kept.
        val ils = PlanProcedures.Pick("KOSH", "I36", "approach", "ILS RWY 36")
        val picks = PlanProcedures.State(picks = listOf(ils), direct = mapOf(ils.key to "VEGAS"))
        val undo = RouteUndo()
        undo.took(RouteUndo.Kind.REMOVED, ils.name, route, emptyList(), direct = null, was = null, procedures = picks)
        val note = undo.take()!!
        assertTrue(note.kind.loud)
        assertEquals("ILS RWY 36", note.ident)
        assertEquals(picks, note.procedures)
    }
}
