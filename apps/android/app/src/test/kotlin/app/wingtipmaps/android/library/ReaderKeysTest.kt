package app.wingtipmaps.android.library

import androidx.compose.ui.input.key.Key
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The reader's keys on a tablet's keyboard (ReaderKeys). */
class ReaderKeysTest {
    private fun key(key: Key, ctrl: Boolean = false, shift: Boolean = false, typing: Boolean = false) = ReaderKeys.of(key, ctrl, shift, typing)

    @Test
    fun theArrowsAndPageKeysTurnThePages() {
        assertEquals(ReaderKey.NEXT_PAGE, key(Key.DirectionRight))
        assertEquals(ReaderKey.NEXT_PAGE, key(Key.PageDown))
        assertEquals(ReaderKey.NEXT_PAGE, key(Key.Spacebar))
        assertEquals(ReaderKey.PREVIOUS_PAGE, key(Key.Spacebar, shift = true))
        assertEquals(ReaderKey.PREVIOUS_PAGE, key(Key.DirectionLeft))
        assertEquals(ReaderKey.FIRST_PAGE, key(Key.MoveHome))
        assertEquals(ReaderKey.LAST_PAGE, key(Key.MoveEnd))
    }

    @Test
    fun ctrlFindsBookmarksAndZooms() {
        assertEquals(ReaderKey.FIND, key(Key.F, ctrl = true))
        assertEquals(ReaderKey.NEXT_MATCH, key(Key.G, ctrl = true))
        assertEquals(ReaderKey.PREVIOUS_MATCH, key(Key.G, ctrl = true, shift = true))
        assertEquals(ReaderKey.BOOKMARK, key(Key.D, ctrl = true))
        assertEquals(ReaderKey.ZOOM_IN, key(Key.Equals, ctrl = true))
        assertEquals(ReaderKey.ZOOM_OUT, key(Key.Minus, ctrl = true))
        assertEquals(ReaderKey.FIT, key(Key.Zero, ctrl = true))
    }

    @Test
    fun whileTypingTheFieldKeepsItsKeysButEnterAndEscape() {
        assertNull(key(Key.DirectionRight, typing = true))
        assertNull(key(Key.Spacebar, typing = true))
        assertEquals(ReaderKey.NEXT_MATCH, key(Key.Enter, typing = true))
        assertEquals(ReaderKey.PREVIOUS_MATCH, key(Key.Enter, shift = true, typing = true))
        assertEquals(ReaderKey.CLOSE, key(Key.Escape, typing = true))
    }
}
