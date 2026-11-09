package app.wingtipmaps.android.design

import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalView

/**
 * The tap felt on a key action, one of the tokens' WingtipHaptic kinds
 * (an altitude set, Direct To, a warning, a detent). View's own
 * performHapticFeedback, which keeps to the system's haptics switch; and
 * none under Reduce Motion as well, as the iOS app does.
 */
@Stable
class Haptics internal constructor(private val view: View, private val reduce: State<Boolean>) {
    fun tap(kind: Int) {
        if (!reduce.value) view.performHapticFeedback(kind)
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    val reduce = rememberUpdatedState(rememberReduceMotion())
    return remember(view) { Haptics(view, reduce) }
}
