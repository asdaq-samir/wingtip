package app.wingtipmaps.android.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** The reader's memory (ReaderMemory): the page left at, the named
 *  bookmarks in order, and Invert Colors following the appearance until
 *  picked. */
class ReaderMemoryTest {
    private val memory = ReaderMemory(File.createTempFile("reader", ".json").apply { delete(); deleteOnExit() })

    @Test
    fun thePageLeftAtIsKeptPerDocument() {
        memory.leftAtPage("phak", 42)
        memory.leftAtSection("cfr-14-91", "91.155")
        assertEquals(42, memory.places.value.pages["phak"])
        assertEquals("91.155", memory.places.value.sections["cfr-14-91"])
        assertNull(memory.places.value.pages["aim"])
    }

    @Test
    fun aBookmarkTappedAgainIsTakenOffAndTheyStayInPageOrder() {
        memory.toggle("aim", Bookmark(page = 412, label = "7-1-5"))
        memory.toggle("aim", Bookmark(page = 12, label = "Contents"))
        assertEquals(listOf(12, 412), memory.places.value.bookmarks["aim"]!!.map { it.page })
        memory.rename("aim", Bookmark(page = 12, label = ""), "Start")
        assertEquals("Start", memory.places.value.bookmarks["aim"]!!.first().label)
        memory.toggle("aim", Bookmark(page = 12, label = "anything"))
        assertEquals(listOf(412), memory.places.value.bookmarks["aim"]!!.map { it.page })
    }

    @Test
    fun invertFollowsTheAppearanceUntilPicked() {
        assertNull(memory.places.value.inverted)
        memory.setInverted(true)
        assertEquals(true, memory.places.value.inverted)
    }

    @Test
    fun aDocumentForgottenTakesItsPlacesWithIt() {
        memory.leftAtPage("own:x", 3)
        memory.toggle("own:x", Bookmark(page = 3, label = "W&B"))
        memory.forget("own:x")
        assertNull(memory.places.value.pages["own:x"])
        assertNull(memory.places.value.bookmarks["own:x"])
    }
}
