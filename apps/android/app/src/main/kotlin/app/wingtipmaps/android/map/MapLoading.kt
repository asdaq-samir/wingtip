package app.wingtipmaps.android.map

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace

/**
 * Wingtip Maps' mark turning in the middle of the map while it loads, as
 * the web's MapLoading (the owner, 2026-11-07): the dashed airspace ring
 * of the app's icon goes round the airplane, which holds still, in the
 * middle of what the sheet leaves ([bottomInset]), where the map opens
 * on the pilot's last position. Over the map's area in the screen's
 * background colour until the map is first shown ([shown] false), then
 * faded out with the map coming in under it, so chart and overlays appear
 * as one thing. With the system's animations off, the mark stands still
 * and the fade is cut. Where the chart could not be fetched at all (the
 * first launch with no connection), the mark stops and says why under
 * it, where the map would be ([problem]).
 */
@Composable
fun MapLoading(shown: Boolean, bottomInset: Dp, modifier: Modifier = Modifier, problem: String? = null) {
    AnimatedVisibility(visible = shown, enter = EnterTransition.None, exit = fadeOut(tween(REVEAL_FADE_MS)), modifier = modifier) {
        Box(
            Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(bottom = bottomInset)
                .semantics { contentDescription = "Loading the map" },
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
                Mark(Modifier.size(56.dp), still = problem != null)
                if (problem != null) {
                    Text(
                        problem,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = WingtipSpace.Xxl),
                    )
                }
            }
        }
    }
}

/** How long the map fades in, the web's REVEAL_FADE_MS. */
const val REVEAL_FADE_MS = 150

/** The app icon's colours (docs/brand, the web's MapLoading): the ring's
 *  magenta and the airplane's navy, lighter and white in the dark. */
private val RING = WingtipColors.Brand.MarkRing
private val RING_DARK = WingtipColors.Brand.MarkRingNight
private val PLANE = WingtipColors.Brand.MarkPlane
private val PLANE_DARK = Color.White

@Composable
private fun Mark(modifier: Modifier, still: Boolean) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    // Android's "Remove animations" (the animator scale at 0) is the
    // platform's ask for less motion: the ring then holds still.
    val noMotion = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val turn = if (still || noMotion) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "map loading")
        transition.animateFloat(
            initialValue = 0f, targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(1600, easing = LinearEasing), RepeatMode.Restart),
            label = "ring",
        ).value
    }
    val ring = if (dark) RING_DARK else RING
    val plane = if (dark) PLANE_DARK else PLANE
    Canvas(modifier) {
        // The icon's 32-unit box, as its SVG's viewBox.
        scale(size.minDimension / 32f, pivot = Offset.Zero) {
            rotate(turn - 112.5f, pivot = Offset(16f, 16f)) {
                drawCircle(
                    ring, radius = 13f, center = Offset(16f, 16f),
                    style = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(7f, 3.2f))),
                )
            }
            translate(16f, 16.3f) {
                scale(0.36f, pivot = Offset.Zero) {
                    translate(-32f, -31.5f) { airplane(plane) }
                }
            }
        }
    }
}

/** The icon's airplane from above: fuselage, wing and tail, filled and
 *  edged in one colour with round joins, as the icon's SVG draws it. */
private fun DrawScope.airplane(colour: Color) {
    val fuselage = Path().apply {
        moveTo(32f, 12f)
        cubicTo(34.2f, 12f, 35f, 14.5f, 35f, 18f)
        lineTo(34.2f, 44f)
        lineTo(33f, 51f)
        lineTo(31f, 51f)
        lineTo(29.8f, 44f)
        lineTo(29f, 18f)
        cubicTo(29f, 14.5f, 29.8f, 12f, 32f, 12f)
        close()
    }
    val edge = Stroke(width = 3.5f, join = StrokeJoin.Round, cap = StrokeCap.Round)
    for (style in listOf(Fill, edge)) {
        drawPath(fuselage, colour, style = style)
        drawRoundRect(colour, Offset(9f, 23f), Size(46f, 6.5f), CornerRadius(3f), style = style)
        drawRoundRect(colour, Offset(23f, 45f), Size(18f, 4.5f), CornerRadius(2.2f), style = style)
    }
}
