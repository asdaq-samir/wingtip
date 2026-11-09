package app.wingtipmaps.android.design

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.wingtipmaps.android.design.generated.WingtipMotion

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

private fun readReduceMotion(context: Context): Boolean =
    reduceMotion(Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f))

/** Material's shared-axis slide: 30 dp, the length its motion guide gives. */
private val SharedAxisSlide = 30.dp

/**
 * One page giving way to the next along X, Material's shared-axis
 * transition: the old page slides 30 dp and fades out in the first third
 * of motion.page, the new one slides in from the other side and fades in
 * over the rest, on the sheet's ease-out (no spring, decision 0018). A
 * higher index comes from the end, a lower one from the start. Under
 * Reduce Motion it is a plain cross-fade of the same length.
 */
@Composable
fun SharedAxisContent(target: Int, modifier: Modifier = Modifier, content: @Composable (Int) -> Unit) {
    val reduce = rememberReduceMotion()
    val slide = with(LocalDensity.current) { SharedAxisSlide.roundToPx() }
    AnimatedContent(
        targetState = target,
        modifier = modifier,
        transitionSpec = { sharedAxisX(forward = targetState > initialState, slide = slide, reduce = reduce) },
        label = "sharedAxis",
    ) { content(it) }
}

private fun AnimatedContentTransitionScope<Int>.sharedAxisX(forward: Boolean, slide: Int, reduce: Boolean): ContentTransform {
    val out = WingtipMotion.PAGE_MS * 35 / 100
    if (reduce) {
        return (fadeIn(tween(WingtipMotion.PAGE_MS)) togetherWith fadeOut(tween(WingtipMotion.PAGE_MS)))
            .using(SizeTransform(clip = false) { _, _ -> snap() })
    }
    val sign = if (forward) 1 else -1
    val move = tween<IntOffset>(WingtipMotion.PAGE_MS, easing = WingtipMotion.SheetEase)
    val enter = slideInHorizontally(move) { sign * slide } +
        fadeIn(tween(WingtipMotion.PAGE_MS - out, delayMillis = out, easing = WingtipMotion.SheetEase))
    val exit = slideOutHorizontally(move) { -sign * slide } +
        fadeOut(tween(out, easing = WingtipMotion.SheetEase))
    return (enter togetherWith exit).using(SizeTransform(clip = false))
}
