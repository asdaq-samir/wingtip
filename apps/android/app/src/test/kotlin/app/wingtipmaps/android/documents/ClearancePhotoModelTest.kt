package app.wingtipmaps.android.documents

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.documents.model.ClearanceNote
import app.wingtipmaps.android.documents.model.DocumentRead
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** The clearance card's From a Photo: the note read and shown with its
 *  words said, a page with no clearance giving none to use, a failed
 *  read said in the server's words, and the sheet put away. */
class ClearancePhotoModelTest {
    @get:Rule val main = MainRule()

    @Test
    fun theNoteIsShownWithItsWordsToUse() {
        val m = ClearancePhotoModel()
        m.read { DocumentRead(kind = "clearance", model = "m", clearance = ClearanceNote(said = "cleared to Madison", written = "C MSN")) }
        assertFalse(m.state.value.reading)
        assertEquals("cleared to Madison", m.state.value.said)
        m.close()
        assertNull(m.state.value.shown)
    }

    @Test
    fun aPageWithNoClearanceHasNothingToUse() {
        val m = ClearancePhotoModel()
        m.read { DocumentRead(kind = "clearance", model = "m", unreadable = "Too dark") }
        assertNull(m.state.value.said)
    }

    @Test
    fun aFailedReadIsSaid() {
        val m = ClearancePhotoModel()
        m.read { throw Planner.Failure(401, null) }
        assertEquals("Sign in to read a page.", m.state.value.problem)
    }
}
