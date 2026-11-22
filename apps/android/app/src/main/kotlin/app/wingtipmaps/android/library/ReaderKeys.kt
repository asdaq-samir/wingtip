package app.wingtipmaps.android.library

import androidx.compose.ui.input.key.Key

/** What a key does in the reader. */
enum class ReaderKey { NEXT_PAGE, PREVIOUS_PAGE, FIRST_PAGE, LAST_PAGE, FIND, NEXT_MATCH, PREVIOUS_MATCH, BOOKMARK, ZOOM_IN, ZOOM_OUT, FIT, CLOSE }

/**
 * The reader's keys on a tablet's or a Chromebook's keyboard, as
 * Android's own document viewers and the web's reader take them: the
 * arrows, Page Up and Down, Space and Home and End turn the pages; Ctrl+F
 * finds, Enter (Shift+Enter) or Ctrl+G (Ctrl+Shift+G) the next match or
 * the one before; Ctrl+D bookmarks the page; Ctrl+Plus, Ctrl+Minus and
 * Ctrl+0 zoom, as androidx.pdf's viewer does; Escape closes. A key the
 * search field is typing into is the field's (`typing`).
 */
object ReaderKeys {
    fun of(key: Key, ctrl: Boolean, shift: Boolean, typing: Boolean): ReaderKey? {
        if (ctrl) {
            return when (key) {
                Key.F -> ReaderKey.FIND
                Key.G -> if (shift) ReaderKey.PREVIOUS_MATCH else ReaderKey.NEXT_MATCH
                Key.D -> ReaderKey.BOOKMARK
                Key.Equals, Key.Plus, Key.NumPadAdd -> ReaderKey.ZOOM_IN
                Key.Minus, Key.NumPadSubtract -> ReaderKey.ZOOM_OUT
                Key.Zero, Key.NumPad0 -> ReaderKey.FIT
                else -> null
            }
        }
        if (typing) {
            return when (key) {
                Key.Enter, Key.NumPadEnter -> if (shift) ReaderKey.PREVIOUS_MATCH else ReaderKey.NEXT_MATCH
                Key.Escape -> ReaderKey.CLOSE
                else -> null
            }
        }
        return when (key) {
            Key.DirectionRight, Key.PageDown, Key.Spacebar -> if (shift && key == Key.Spacebar) ReaderKey.PREVIOUS_PAGE else ReaderKey.NEXT_PAGE
            Key.DirectionLeft, Key.PageUp -> ReaderKey.PREVIOUS_PAGE
            Key.MoveHome -> ReaderKey.FIRST_PAGE
            Key.MoveEnd -> ReaderKey.LAST_PAGE
            Key.Escape -> ReaderKey.CLOSE
            else -> null
        }
    }
}
