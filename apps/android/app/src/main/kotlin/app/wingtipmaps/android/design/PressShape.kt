package app.wingtipmaps.android.design

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.CornerSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection

/**
 * A shape part way between two rounded ones, corner by corner: `at` 0 is
 * `from`, 1 is `to`, and a spring's overshoot past either end is drawn
 * too (never below a square corner). A value, so a new fraction is a new
 * shape and the outline is drawn again.
 */
@Immutable
data class MorphShape(val from: CornerBasedShape, val to: CornerBasedShape, val at: Float) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        fun corner(a: CornerSize, b: CornerSize): CornerSize {
            val start = a.toPx(size, density)
            return CornerSize((start + (b.toPx(size, density) - start) * at).coerceAtLeast(0f))
        }
        return RoundedCornerShape(
            topStart = corner(from.topStart, to.topStart),
            topEnd = corner(from.topEnd, to.topEnd),
            bottomEnd = corner(from.bottomEnd, to.bottomEnd),
            bottomStart = corner(from.bottomStart, to.bottomStart),
        ).createOutline(size, layoutDirection, density)
    }
}

/**
 * Material 3 Expressive's shape morph on a press: a button's corners
 * tighten from `rest` to `pressed` while the finger is down and spring
 * back as it lifts, on the motion scheme's fast spatial spring (at once
 * under Remove animations). Give the button the same interaction source.
 */
@Composable
fun rememberPressShape(
    interaction: InteractionSource,
    rest: CornerBasedShape = CircleShape,
    pressed: CornerBasedShape = MaterialTheme.shapes.small,
): Shape {
    val down by interaction.collectIsPressedAsState()
    val at by animateFloatAsState(if (down) 1f else 0f, ExpressiveMotion.current.fastSpatialSpec(), label = "pressShape")
    return MorphShape(rest, pressed, at)
}
