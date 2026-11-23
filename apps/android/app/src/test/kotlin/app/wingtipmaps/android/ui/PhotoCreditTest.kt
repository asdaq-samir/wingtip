package app.wingtipmaps.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/** A field's photo from the ground carries what its licence asks: the
 *  photographer, the licence, and its page, which the credit links to. */
class PhotoCreditTest {
    @Test
    fun aCommonsPhotoIsCreditedWithItsLicenceAndLinkedToItsPage() {
        val page = "https://commons.wikimedia.org/wiki/File:X.jpg"
        val picture = groundPicture("From the ground", "https://upload.wikimedia.org/x.jpg", "Jane Doe", "CC BY-SA 4.0", page)
        assertEquals("Jane Doe · CC BY-SA 4.0", picture.credit)
        assertEquals(page, picture.page)
        // Its tap opens the viewer to zoom; the credit there is the link.
        assertFalse(picture.tapOpensPage)
    }

    @Test
    fun aPhotoWithNoLicenceNamedKeepsItsCredit() {
        assertEquals("Jane Doe", groundPicture("From the ground", "/x.jpg", "Jane Doe", null, null).credit)
        assertEquals("Jane Doe", groundPicture("From the ground", "/x.jpg", "Jane Doe", "", null).credit)
    }
}
