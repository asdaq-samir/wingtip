package app.wingtipmaps.android.documents

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.documents.model.ClearanceNote
import app.wingtipmaps.android.documents.model.DocumentRead
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** The clearance card's From a Photo: the note read and shown with its
 *  words said, a page with no clearance giving none to use, a failed
 *  read said in the phone's words, and the sheet put away. */
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
        // The page is read on the phone alone since the server's reader went
        // (decision 0041): what fails is the phone's read, said in its words.
        val m = ClearancePhotoModel()
        m.read { throw Documents.Unread() }
        assertEquals("This page could not be read on this phone. Try a sharper, flatter photo.", m.state.value.problem)
    }
}
