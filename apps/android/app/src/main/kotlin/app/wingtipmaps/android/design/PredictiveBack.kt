package app.wingtipmaps.android.design

import androidx.activity.BackEventCompat
import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import app.wingtipmaps.android.design.generated.WingtipSpace

/** How small a card gets at the end of the gesture: Material's
 *  predictive back shrinks it by a tenth. */
internal const val BACK_SHRINK = 0.1f

/** The card's scale at `progress` of the gesture. */
internal fun backScale(progress: Float): Float = 1f - BACK_SHRINK * progress.coerceIn(0f, 1f)

/** The back gesture on a card: how far it is drawn back now, 0 to 1
 *  (eased back to 0 when let go or cancelled), and from which edge. */
@Stable
class PredictiveBackState internal constructor(private val progressNow: State<Float>, private val edgeNow: State<Boolean>, val still: Boolean) {
    val progress: Float get() = if (still) 0f else progressNow.value
    val fromLeft: Boolean get() = edgeNow.value
}

/**
 * The system's predictive back for a card, a page or an answer that Back
 * closes: while the gesture is held the thing shrinks toward the edge it
 * was swiped from (Modifier.predictiveBack), showing what is under it; let
 * go, and `onBack` closes it; cancelled, it springs back on the motion
 * scheme's spring. The Android 14 and later gesture (the manifest's
 * enableOnBackInvokedCallback); before that Back closes it at once.
 * Nothing moves under Remove animations.
 */
@Composable
fun rememberPredictiveBack(enabled: Boolean, onBack: () -> Unit): PredictiveBackState {
    var held by remember { mutableFloatStateOf(0f) }
    val edge = remember { mutableStateOf(true) }
    PredictiveBackHandler(enabled = enabled) { events ->
        try {
            events.collect { e ->
                held = e.progress
                edge.value = e.swipeEdge == BackEventCompat.EDGE_LEFT
            }
            onBack()
        } finally {
            held = 0f
        }
    }
    val progress = animateFloatAsState(held, MaterialTheme.motionScheme.fastSpatialSpec(), label = "predictiveBack")
    val still = rememberReduceMotion()
    return remember(progress, edge, still) { PredictiveBackState(progress, edge, still) }
}

/** Draws the card as the back gesture has it: a tenth smaller at the full
 *  swipe and moved toward the edge it was swiped from. */
fun Modifier.predictiveBack(back: PredictiveBackState): Modifier = graphicsLayer {
    val progress = back.progress
    val scale = backScale(progress)
    scaleX = scale
    scaleY = scale
    translationX = (if (back.fromLeft) 1 else -1) * WingtipSpace.Xl.toPx() * progress
    transformOrigin = TransformOrigin(if (back.fromLeft) 1f else 0f, 0.5f)
}
