package app.wingtipmaps.android.ui

import app.wingtipmaps.android.Links
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What a drop on the window is (Dropped.of): the app's own link opened,
 *  other words for the search, a sign-in link or another address never. */
class DroppedTest {
    @Test
    fun theAppsLinkIsOpened() {
        assertEquals(Dropped.Link(Links.Place("KORD")), Dropped.of("https://wingtipmaps.app/app/plan?place=kord"))
    }

    @Test
    fun otherWordsGoToTheSearch() {
        assertEquals(Dropped.Words("KMSN KOSH"), Dropped.of("  KMSN KOSH \n"))
        assertEquals(Dropped.Words("first line"), Dropped.of("first line\nsecond line"))
        assertEquals(Dropped.MOST_WORDS, (Dropped.of("x".repeat(500)) as Dropped.Words).words.length)
    }

    @Test
    fun aSignInLinkOrNothingIsNoDrop() {
        assertNull(Dropped.of("https://wingtipmaps.app/api/auth/magic-link/verify?token=abc"))
        assertNull(Dropped.of("https://example.com/somewhere"))
        assertNull(Dropped.of("   "))
        assertNull(Dropped.of(null))
    }
}
