package app.wingtipmaps.android.design

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.graphics.shapes.CornerRounding
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.circle
import androidx.graphics.shapes.star
import androidx.graphics.shapes.toPath
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipMotion
import app.wingtipmaps.android.design.generated.WingtipSize

/** How round each shape's corners are, as a part of its radius. */
private const val SOFT = 0.3f

/** The shapes the indicator morphs through in turn, each on a unit
 *  circle at the origin: Material 3 Expressive's soft burst, nine-sided
 *  cookie, pentagon, four-sided cookie and oval, as its loading
 *  indicator has them. */
private val Shapes: List<RoundedPolygon> = listOf(
    RoundedPolygon.star(numVerticesPerRadius = 10, innerRadius = 0.82f, rounding = CornerRounding(SOFT / 2)),
    RoundedPolygon.star(numVerticesPerRadius = 9, innerRadius = 0.8f, rounding = CornerRounding(SOFT)),
    RoundedPolygon(numVertices = 5, rounding = CornerRounding(SOFT)),
    RoundedPolygon.star(numVerticesPerRadius = 4, innerRadius = 0.7f, rounding = CornerRounding(SOFT)),
    RoundedPolygon.circle(numVertices = 8),
)

/** Each shape's morph into the next, the last's into the first. */
private val Morphs: List<Morph> = Shapes.indices.map { Morph(Shapes[it], Shapes[(it + 1) % Shapes.size]) }

/** One shape's turn, start to the next: a page's time twice over. */
private const val TURN_MS = WingtipMotion.PAGE_MS * 2

/** How far the indicator turns while one shape gives way to the next:
 *  a whole circle over the five. */
private val TurnDeg = 360f / Shapes.size

/**
 * Something being fetched where no skeleton stands in for it (a button's
 * work, a page's first answer): Material 3 Expressive's loading indicator,
 * a shape in the tint that morphs from one rounded shape to the next as
 * it turns. The BOM's Material 3 (1.4) has none of its own, so it is
 * drawn here from the same graphics-shapes polygons. Held still under
 * Remove animations; TalkBack reads it as "Loading", an indeterminate
 * progress bar.
 *
 * @param modifier its size; the tap target's by default.
 */
@Composable
fun LoadingIndicator(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val reduce = rememberReduceMotion()
    val loading = stringResource(R.string.loading)
    val turn = if (reduce) {
        null
    } else {
        rememberInfiniteTransition(label = "loading").animateFloat(
            initialValue = 0f,
            targetValue = Morphs.size.toFloat(),
            animationSpec = infiniteRepeatable(tween(TURN_MS * Morphs.size, easing = LinearEasing), RepeatMode.Restart),
            label = "loadingTurn",
        )
    }
    val path = remember { android.graphics.Path() }
    Canvas(
        modifier.size(WingtipSize.TapTarget).semantics {
            contentDescription = loading
            progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
        },
    ) {
        val at = turn?.value ?: 0f
        val index = at.toInt().coerceIn(0, Morphs.lastIndex)
        // Each morph eases in and out of its shape, so a shape is seen
        // whole for a moment before it gives way.
        val t = at - index
        val eased = t * t * (3 - 2 * t)
        Morphs[index].toPath(eased, path.apply { rewind() })
        val radius = size.minDimension * INDICATOR_PART / 2
        val shape = path.asComposePath()
        withTransform({
            translate(center.x, center.y)
            rotate(at * TurnDeg, pivot = Offset.Zero)
            scale(radius, radius, pivot = Offset.Zero)
        }) { drawPath(shape, color) }
    }
}

/** The shape's part of the indicator's box, as Material's 38 in 48. */
private const val INDICATOR_PART = 38f / 48f
