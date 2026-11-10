package app.wingtipmaps.android.design

import android.content.Context
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.MaterialTheme
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

/** Material's shared-axis slide: 30 dp, the length its motion guide gives. */
private val SharedAxisSlide = 30.dp

/**
 * One page giving way to the next along X, Material's shared-axis
 * transition on the theme's motion scheme (Material 3 Expressive's
 * springs; the owner, 2026-11-09, follow the stock motion now that the
 * components are stock): the old page slides 30 dp and fades out, the new
 * one slides in from the other side and fades in, the slide on the
 * default spatial spring and the fades on the effects springs, which
 * never overshoot. A higher index comes from the end, a lower one from
 * the start. Under Reduce Motion it is a plain cross-fade.
 */
@Composable
fun SharedAxisContent(target: Int, modifier: Modifier = Modifier, content: @Composable (Int) -> Unit) {
    val reduce = rememberReduceMotion()
    val slide = with(LocalDensity.current) { SharedAxisSlide.roundToPx() }
    val scheme = MaterialTheme.motionScheme
    val move = scheme.defaultSpatialSpec<IntOffset>()
    val fadeInSpec = scheme.defaultEffectsSpec<Float>()
    val fadeOutSpec = scheme.fastEffectsSpec<Float>()
    AnimatedContent(
        targetState = target,
        modifier = modifier,
        transitionSpec = {
            sharedAxisX(forward = targetState > initialState, slide = slide, reduce = reduce, move = move, fadeInSpec = fadeInSpec, fadeOutSpec = fadeOutSpec)
        },
        label = "sharedAxis",
    ) { content(it) }
}

private fun AnimatedContentTransitionScope<Int>.sharedAxisX(
    forward: Boolean,
    slide: Int,
    reduce: Boolean,
    move: FiniteAnimationSpec<IntOffset>,
    fadeInSpec: FiniteAnimationSpec<Float>,
    fadeOutSpec: FiniteAnimationSpec<Float>,
): ContentTransform {
    if (reduce) {
        return (fadeIn(fadeInSpec) togetherWith fadeOut(fadeOutSpec)).using(SizeTransform(clip = false) { _, _ -> snap() })
    }
    val sign = if (forward) 1 else -1
    val enter = slideInHorizontally(move) { sign * slide } + fadeIn(fadeInSpec)
    val exit = slideOutHorizontally(move) { -sign * slide } + fadeOut(fadeOutSpec)
    return (enter togetherWith exit).using(SizeTransform(clip = false))
}
