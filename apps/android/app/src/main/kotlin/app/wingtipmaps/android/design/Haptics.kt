package app.wingtipmaps.android.design

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import app.wingtipmaps.android.design.generated.WingtipHaptic

/**
 * The tap felt on a key action, one of the tokens' WingtipHaptic kinds
 * (an altitude set, Direct To, a warning, a detent) or a screen's own.
 * Compose's LocalHapticFeedback, which plays the older constant itself
 * where the phone's API is older than the effect and keeps to the
 * system's haptics switch, the one that governs it. In the Native look
 * (LocalNative) the app adds no taps of its own, so only the stock
 * components' own are felt, save a warning: that one carries meaning, as
 * a caution's colour does, and is kept in every look.
 */
@Stable
class Haptics internal constructor(private val feedback: HapticFeedback, private val native: Boolean) {
    fun tap(kind: HapticFeedbackType) {
        if (felt(kind, native)) feedback.performHapticFeedback(kind)
    }

    internal companion object {
        /** Whether a kind is felt: every one, or in Native a warning alone. */
        fun felt(kind: HapticFeedbackType, native: Boolean): Boolean = !native || kind == WingtipHaptic.WARNING
    }
}

@Composable
fun rememberHaptics(): Haptics {
    val feedback = LocalHapticFeedback.current
    val native = LocalNative.current
    return remember(feedback, native) { Haptics(feedback, native) }
}
