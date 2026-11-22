package app.wingtipmaps.android.navigation

import android.view.KeyEvent
import androidx.annotation.StringRes
import app.wingtipmaps.android.R
import app.wingtipmaps.android.navigation.generated.Screen

/**
 * The app's keyboard shortcuts with a hardware keyboard (a tablet's
 * keyboard case, a desktop window, a Chromebook), each named in Android's
 * Keyboard Shortcuts Helper (Meta+/, MainActivity's
 * onProvideKeyboardShortcuts). They are the iPad's menu bar's
 * (WingtipCommands) on Android's Ctrl, as Android's adaptive quality
 * guidelines ask (Tier 2 Keyboard_Shortcuts and Tier 1 Keyboard_Parity:
 * "shortcut parity with the web and desktop versions"): a screen opens
 * the one way a screen opens by name (ScreenRequests), and Ctrl+Z and
 * Ctrl+Shift+Z undo and redo the last route edit, as its toast's Undo
 * does (Plan.undoEdit). A text field keeps Ctrl+Z for its own words, as
 * the field takes the key first. Esc goes back one level (MainActivity),
 * the system's fallback for an unhandled Esc, and does nothing where
 * there is nowhere to go back to.
 */
enum class Shortcut(
    @StringRes val label: Int,
    val key: Int,
    val screen: Screen? = null,
    val shift: Boolean = false,
) {
    SEARCH(R.string.search_hint, KeyEvent.KEYCODE_F, Screen.SEARCH),
    FPL(R.string.screen_fpl, KeyEvent.KEYCODE_2, Screen.FPL),
    BRIEF(R.string.brief, KeyEvent.KEYCODE_B, Screen.BRIEF),
    NAV_LOG(R.string.nav_log, KeyEvent.KEYCODE_L, Screen.NAVLOG),
    NEAREST(R.string.nearest, KeyEvent.KEYCODE_N, Screen.NEAREST, shift = true),
    CHECKLISTS(R.string.checklists, KeyEvent.KEYCODE_K, Screen.CHECKLISTS, shift = true),
    EMERGENCY(R.string.emergency, KeyEvent.KEYCODE_E, Screen.EMERGENCY, shift = true),
    FLIGHTS(R.string.saved_flights, KeyEvent.KEYCODE_O, Screen.FLIGHTS),
    LOGBOOK(R.string.logbook, KeyEvent.KEYCODE_G, Screen.LOGBOOK, shift = true),
    SETTINGS(R.string.settings, KeyEvent.KEYCODE_COMMA, Screen.SETUP),
    UNDO(R.string.undo, KeyEvent.KEYCODE_Z),
    REDO(R.string.redo, KeyEvent.KEYCODE_Z, shift = true),
    ;

    /** The modifiers the Keyboard Shortcuts Helper shows it with. */
    val meta: Int get() = KeyEvent.META_CTRL_ON or (if (shift) KeyEvent.META_SHIFT_ON else 0)

    companion object {
        /** The shortcut a key pressed with Ctrl (and Shift) is, or none:
         *  Alt and Meta held are some other app's or the system's. */
        fun of(key: Int, ctrl: Boolean, shift: Boolean, alt: Boolean = false): Shortcut? {
            if (!ctrl || alt) return null
            return entries.firstOrNull { it.key == key && it.shift == shift }
        }
    }
}
