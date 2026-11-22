package app.wingtipmaps.android.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A document's place as the web's address writes it (docPlace.ts and its
 *  tests): one format on every app, so a link shared from one opens on
 *  another. */
class DocPlaceTest {
    @Test
    fun aPlaceIsReadAsTheWebWritesIt() {
        assertEquals(DocPlace("aim", at = "7-1-5"), DocPlace.parse("aim@7-1-5"))
        assertEquals(DocPlace("cfr-14-91", at = "91.155"), DocPlace.parse("cfr-14-91@91.155"))
        assertEquals(DocPlace("phak", page = 42), DocPlace.parse("phak@p42"))
        assertEquals(DocPlace("phak"), DocPlace.parse("phak"))
        assertEquals(DocPlace("own:abc123"), DocPlace.parse("own:abc123"))
    }

    @Test
    fun aPlaceIsWrittenBackTheSame() {
        for (text in listOf("aim@7-1-5", "cfr-14-91@91.155", "phak@p42", "phak", "own:abc123")) {
            assertEquals(text, DocPlace.parse(text)!!.text)
        }
    }

    @Test
    fun anythingToReadAsAPathIsNoPlace() {
        assertNull(DocPlace.parse("../etc"))
        assertNull(DocPlace.parse("aim/../x"))
        assertNull(DocPlace.parse(""))
        assertNull(DocPlace.parse(null))
        // A place it cannot read opens the document at its start.
        assertEquals(DocPlace("aim"), DocPlace.parse("aim@<x>"))
        assertEquals(DocPlace("phak", page = 1), DocPlace.parse("phak@p0"))
    }

    @Test
    fun theLibrarysPlacesHaveALinkAndThePilotsOwnNone() {
        assertEquals("https://wingtipmaps.app/app/plan?doc=aim%407-1-5", DocPlace("aim", at = "7-1-5").link("https://wingtipmaps.app"))
        assertNull(DocPlace.own("abc").link("https://wingtipmaps.app"))
        assertTrue(DocPlace.own("abc").isOwn)
        assertFalse(DocPlace("aim").isOwn)
    }
}
