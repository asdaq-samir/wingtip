package app.wingtipmaps.android.design

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset

/** Which way a figure rolls: up as it grows, down as it shrinks. */
internal fun rollsUp(old: String, new: String): Boolean {
    val before = old.filter(Char::isDigit).toLongOrNull()
    val after = new.filter(Char::isDigit).toLongOrNull()
    return before == null || after == null || after >= before
}

/**
 * A figure that changes in place (the ETE counting down, the fuel left,
 * the miles to go, the altitude) rolling its changed digits like a
 * counter rather than blinking, as the iPhone's numericText transition
 * does: each character that changed slides out and the new one in, up as
 * the figure grows and down as it shrinks, on the motion scheme's fast
 * springs; the digits are tabular, so the others hold still. Under Remove
 * animations, or past the line's width (where it wraps), it is plain text.
 * Its parent says it to TalkBack, which hears the figure, not the roll.
 */
@Composable
fun RollingFigure(
    value: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
    maxLines: Int = 1,
) {
    val steady = style.copy(fontFeatureSettings = "tnum")
    if (rememberReduceMotion() || maxLines > 1) {
        Text(value, modifier, color = color, style = steady, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
        return
    }
    val motion = MaterialTheme.motionScheme
    // Every digit rolls the way the whole figure went, as a counter's
    // wheels do (19 to 20 rolls both digits up).
    val last = remember { arrayOf(value) }
    val up = remember(value) { rollsUp(last[0], value).also { last[0] = value } }
    AnimatedContent(
        targetState = value,
        modifier = modifier,
        transitionSpec = { roll(motion, up) },
        // The whole figure changes as one only when its length does; a
        // figure of the same length rolls character by character.
        contentKey = { it.length },
        label = "figure",
    ) { shown ->
        Row {
            shown.forEachIndexed { i, ch ->
                AnimatedContent(
                    targetState = ch,
                    transitionSpec = { roll(motion, up) },
                    label = "figure$i",
                ) { c -> Text(c.toString(), color = color, style = steady, maxLines = 1) }
            }
        }
    }
}

/** One roll: the new text in from below and the old out at the top as
 *  the figure grows, the other way as it shrinks, clipped to the line. */
private fun roll(motion: MotionScheme, up: Boolean): ContentTransform {
    val sign = if (up) 1 else -1
    val enter = slideInVertically(motion.fastSpatialSpec<IntOffset>()) { sign * it } + fadeIn(motion.fastEffectsSpec())
    val exit = slideOutVertically(motion.fastSpatialSpec<IntOffset>()) { -sign * it } + fadeOut(motion.fastEffectsSpec())
    return ContentTransform(enter, exit, sizeTransform = SizeTransform(clip = true))
}
