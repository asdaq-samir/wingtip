package app.wingtipmaps.android.balance

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor

/** A point on the envelope's graph: the arm, inches aft of the datum,
 *  and the weight, pounds. */
data class EnvelopePoint(val armIn: Double, val weightLb: Double)

/**
 * The POH's centre-of-gravity envelope -- weight up, arm across -- with the
 * takeoff and landing points on it and the line the fuel burned takes
 * between them, as the loading graph is read: the web's EnvelopeChart
 * (Recharts) drawn with Compose's Canvas, the same axes (a whole inch past
 * each end, a hundred pounds past each end), the envelope in the muted ink
 * and the load in the tint. The points are the engine's (gonogo_balance);
 * nothing is worked out here but where each is drawn. A point with no
 * centre of gravity (nothing aboard) has nowhere to sit. TalkBack hears
 * the engine's words for the takeoff and landing instead (`said`).
 */
@Composable
fun EnvelopeChart(envelope: List<EnvelopePoint>, takeoff: EnvelopePoint?, landing: EnvelopePoint?, said: String, modifier: Modifier = Modifier) {
    if (envelope.size < 3) return
    val ink = MaterialTheme.colorScheme.onSurfaceVariant
    val tint = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    val label = MaterialTheme.typography.labelSmall.copy(color = ink)
    val measurer = rememberTextMeasurer()
    val loaded = listOfNotNull(takeoff, landing)
    val box = remember(envelope, loaded) { Box.of(envelope + loaded) }
    Canvas(modifier.fillMaxWidth().height(224.dp).testTag("envelope-chart").semantics { contentDescription = said }) {
        val left = 48.dp.toPx()
        val bottom = size.height - 20.dp.toPx()
        val top = 12.dp.toPx()
        val right = size.width - 12.dp.toPx()
        fun at(p: EnvelopePoint) = Offset(
            (left + (p.armIn - box.armLo) / (box.armHi - box.armLo) * (right - left)).toFloat(),
            (bottom - (p.weightLb - box.weightLo) / (box.weightHi - box.weightLo) * (bottom - top)).toFloat(),
        )
        axes(box, left, right, top, bottom, grid, measurer, label)
        val outline = Path().apply {
            envelope.forEachIndexed { i, p -> at(p).let { if (i == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) } }
            close()
        }
        drawPath(outline, ink, style = Stroke(width = 2.dp.toPx()))
        if (takeoff != null && landing != null) drawLine(tint, at(landing), at(takeoff), strokeWidth = 2.dp.toPx())
        listOf(takeoff to "Takeoff", landing to "Landing").forEach { (p, name) ->
            p ?: return@forEach
            val c = at(p)
            drawCircle(Color.White, radius = 6.dp.toPx(), center = c)
            drawCircle(tint, radius = 4.5.dp.toPx(), center = c)
            val words = measurer.measure(name, label)
            val y = if (name == "Takeoff") c.y - 8.dp.toPx() - words.size.height else c.y + 8.dp.toPx()
            drawText(words, topLeft = Offset(c.x - words.size.width / 2f, y))
        }
    }
}

/** The graph's reach: a whole inch past the arms at each end, and a
 *  hundred pounds past the weights, as the web's axes are. */
private data class Box(val armLo: Double, val armHi: Double, val weightLo: Double, val weightHi: Double) {
    companion object {
        fun of(points: List<EnvelopePoint>) = Box(
            floor(points.minOf { it.armIn }) - 1, ceil(points.maxOf { it.armIn }) + 1,
            floor(points.minOf { it.weightLb } / 100) * 100 - 100, ceil(points.maxOf { it.weightLb } / 100) * 100 + 100,
        )
    }
}

/** Six ticks each way, dashed lines across, their figures at the left and
 *  the foot: inches across, pounds up. */
private fun DrawScope.axes(box: Box, left: Float, right: Float, top: Float, bottom: Float, grid: Color, measurer: TextMeasurer, style: TextStyle) {
    val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))
    for (i in 0..TICKS) {
        val f = i / TICKS.toFloat()
        val x = left + f * (right - left)
        val y = bottom - f * (bottom - top)
        drawLine(grid, Offset(x, top), Offset(x, bottom), pathEffect = dash)
        drawLine(grid, Offset(left, y), Offset(right, y), pathEffect = dash)
        val arm = measurer.measure(String.format(Locale.US, "%.0f in", box.armLo + f * (box.armHi - box.armLo)), style)
        drawText(arm, topLeft = Offset(x - arm.size.width / 2f, bottom + 4.dp.toPx()))
        val lb = measurer.measure(String.format(Locale.US, "%,.0f", box.weightLo + f * (box.weightHi - box.weightLo)), style)
        drawText(lb, topLeft = Offset(left - lb.size.width - 4.dp.toPx(), y - lb.size.height / 2f))
    }
}

private const val TICKS = 5
