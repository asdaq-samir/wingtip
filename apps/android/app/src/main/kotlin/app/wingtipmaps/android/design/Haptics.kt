package app.wingtipmaps.android.design

import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalView

/**
 * The tap felt on a key action, one of the tokens' WingtipHaptic kinds
 * (an altitude set, Direct To, a warning, a detent). View's own
 * performHapticFeedback, which keeps to the system's haptics switch, the
 * one that governs it.
 */
@Stable
class Haptics internal constructor(private val view: View) {
    fun tap(kind: Int) {
        view.performHapticFeedback(kind)
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    return remember(view) { Haptics(view) }
}
