package app.wingtipmaps.android.navigation

import android.view.KeyEvent
import app.wingtipmaps.android.navigation.generated.Screen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The keyboard's shortcuts (Shortcut): the iPad's menu bar on Ctrl, each
 *  key one shortcut, and none without Ctrl or with Alt held. */
class ShortcutTest {
    @Test
    fun theIpadsShortcutsOnCtrl() {
        assertEquals(Screen.SEARCH, Shortcut.of(KeyEvent.KEYCODE_F, ctrl = true, shift = false)?.screen)
        assertEquals(Screen.BRIEF, Shortcut.of(KeyEvent.KEYCODE_B, ctrl = true, shift = false)?.screen)
        assertEquals(Screen.NAVLOG, Shortcut.of(KeyEvent.KEYCODE_L, ctrl = true, shift = false)?.screen)
        assertEquals(Screen.NEAREST, Shortcut.of(KeyEvent.KEYCODE_N, ctrl = true, shift = true)?.screen)
        assertEquals(Screen.EMERGENCY, Shortcut.of(KeyEvent.KEYCODE_E, ctrl = true, shift = true)?.screen)
        assertEquals(Screen.SETUP, Shortcut.of(KeyEvent.KEYCODE_COMMA, ctrl = true, shift = false)?.screen)
    }

    @Test
    fun undoAndRedoAreTheRoutesEdits() {
        assertEquals(Shortcut.UNDO, Shortcut.of(KeyEvent.KEYCODE_Z, ctrl = true, shift = false))
        assertEquals(Shortcut.REDO, Shortcut.of(KeyEvent.KEYCODE_Z, ctrl = true, shift = true))
        assertNull(Shortcut.UNDO.screen)
    }

    @Test
    fun noShortcutWithoutCtrlOrWithAlt() {
        assertNull(Shortcut.of(KeyEvent.KEYCODE_F, ctrl = false, shift = false))
        assertNull(Shortcut.of(KeyEvent.KEYCODE_F, ctrl = true, shift = false, alt = true))
        // Shift is its own shortcut: Ctrl+Shift+F is none.
        assertNull(Shortcut.of(KeyEvent.KEYCODE_F, ctrl = true, shift = true))
    }

    @Test
    fun everyKeyIsOneShortcut() {
        val keys = Shortcut.entries.map { it.key to it.shift }
        assertEquals(keys.size, keys.toSet().size)
        assertEquals(KeyEvent.META_CTRL_ON or KeyEvent.META_SHIFT_ON, Shortcut.REDO.meta)
    }
}
