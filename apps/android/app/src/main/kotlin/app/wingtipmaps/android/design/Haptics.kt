package app.wingtipmaps.android.design

import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView
import app.wingtipmaps.android.design.generated.WingtipHaptic

/**
 * The tap felt on a key action, one of the tokens' WingtipHaptic kinds
 * (an altitude set, Direct To, a warning, a detent). View's own
 * performHapticFeedback, which keeps to the system's haptics switch, the
 * one that governs it. In the Native look (LocalNative) the app adds no
 * taps of its own, so only the stock components' own are felt, save a
 * warning: that one carries meaning, as a caution's colour does, and is
 * kept in every look.
 */
@Stable
class Haptics internal constructor(private val view: View, private val native: Boolean) {
    fun tap(kind: Int) {
        if (felt(kind, native)) view.performHapticFeedback(kind)
    }

    internal companion object {
        /** Whether a kind is felt: every one, or in Native a warning alone. */
        fun felt(kind: Int, native: Boolean): Boolean = !native || kind == WingtipHaptic.WARNING
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    val native = LocalNative.current
    return remember(view, native) { Haptics(view, native) }
}
