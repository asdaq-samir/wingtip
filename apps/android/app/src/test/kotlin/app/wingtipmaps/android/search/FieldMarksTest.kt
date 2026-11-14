package app.wingtipmaps.android.search

import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.AirportSuggestion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A list's marks on a field: its use as the planner names it, and a
 *  closed field never the one offered to fly to (decision 0043). */
class FieldMarksTest {
    @Test
    fun eachUseHasItsMarkAndAPublicFieldNone() {
        assertEquals(R.string.use_private, FieldMarks.use("private"))
        assertEquals(R.string.use_military, FieldMarks.use("military"))
        assertEquals(R.string.use_joint, FieldMarks.use("joint"))
        assertNull(FieldMarks.use("public"))
        assertNull(FieldMarks.use(null))
    }

    @Test
    fun directToPassesOverAClosedField() {
        // "campbell": the closed 9II2 first in the list would be offered
        // Direct To were it not passed over for the open C81.
        val closed = AirportSuggestion(ident = "9II2", name = "Campbell", closed = "Closed indefinitely")
        val c81 = AirportSuggestion(ident = "C81", name = "Campbell", use = null)
        val fix = AirportSuggestion(ident = "CAMPB", name = "VFR waypoint", kind = "fix")
        assertEquals("C81", FieldMarks.firstOffered(listOf(closed, c81), listOf(fix)))
        assertEquals("CAMPB", FieldMarks.firstOffered(listOf(closed), listOf(fix)))
        assertNull(FieldMarks.firstOffered(listOf(closed), emptyList()))
        assertEquals("C81", FieldMarks.firstOffered(listOf(c81.copy(closed = "")), emptyList()))
    }
}
