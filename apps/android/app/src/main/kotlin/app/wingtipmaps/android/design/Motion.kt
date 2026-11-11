package app.wingtipmaps.android.design

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

/** Whether the pilot has asked for less motion: Accessibility's "Remove
 *  animations" sets the system's animator duration scale to 0, as
 *  Developer options' "Animator duration scale: Animation off" does. */
fun reduceMotion(animatorScale: Float): Boolean = animatorScale == 0f

/** Reduce Motion as a Compose value, read again each time the app comes
 *  back to the front (the switch is in the system's Settings). */
@Composable
fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    var reduce by remember { mutableStateOf(readReduceMotion(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { reduce = readReduceMotion(context) }
    return reduce
}

internal fun readReduceMotion(context: Context): Boolean =
    reduceMotion(Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))

/**
 * Material's shared axis on X, the motion system's pattern for going
 * forward to a page and back from it (MDC's MaterialSharedAxis.X): the
 * page slides 30 dp along the row, the outgoing one fading out over the
 * first 35 % of 300 ms and the incoming one fading in over the rest, so
 * the two are never read over each other. Navigation Compose seeks these
 * with the back gesture's progress, so a predictive back shows the page
 * under the card coming in as the card goes.
 * https://m3.material.io/styles/motion/transitions/transition-patterns
 */
object SharedAxisX {
    private const val DURATION_MS = 300
    private const val OUTGOING_MS = 105
    private val easing = FastOutSlowInEasing

    /** The incoming page, from the end going forward or the start going back. */
    fun enter(shiftPx: Int, forward: Boolean): EnterTransition =
        slideInHorizontally(tween(DURATION_MS, easing = easing)) { if (forward) shiftPx else -shiftPx } +
            fadeIn(tween(DURATION_MS - OUTGOING_MS, delayMillis = OUTGOING_MS, easing = LinearOutSlowInEasing))

    /** The outgoing page, to the start going forward or the end going back. */
    fun exit(shiftPx: Int, forward: Boolean): ExitTransition =
        slideOutHorizontally(tween(DURATION_MS, easing = easing)) { if (forward) -shiftPx else shiftPx } +
            fadeOut(tween(OUTGOING_MS, easing = FastOutLinearInEasing))

    /** How far the pages slide, Material's 30 dp. */
    val Shift = 30.dp
}
