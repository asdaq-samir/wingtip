package app.wingtipmaps.android.scratchpad

import android.graphics.Matrix
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.ink.authoring.compose.InProgressStrokes
import androidx.ink.brush.Brush
import androidx.ink.brush.StockBrushes
import androidx.ink.rendering.android.canvas.CanvasStrokeRenderer
import androidx.ink.storage.decode
import androidx.ink.storage.encode
import androidx.ink.strokes.Stroke
import androidx.ink.strokes.StrokeInputBatch
import java.util.Base64

/**
 * A page's ink, written with a stylus or a finger: Jetpack Ink's own
 * parts as they come -- Compose's InProgressStrokes for the stroke under
 * the pen (drawn ahead of the frame, with the stylus's pressure and tilt),
 * the stock pressure pen, and the Canvas renderer for the strokes kept --
 * so nothing of the writing is hand-built. Each finished stroke is handed
 * up as ink-storage encodes it (InkLine), to be kept on the phone, and
 * every stroke is drawn in the page's ink colour, so a page written by day
 * reads by night.
 */
@Composable
fun InkArea(lines: List<InkLine>, said: String, onWrite: (List<InkLine>) -> Unit, modifier: Modifier = Modifier) {
    val ink = MaterialTheme.colorScheme.onSurface.toArgb()
    val pen = with(LocalDensity.current) { PEN.toPx() }
    val brush = remember(ink, pen) { Brush.createWithColorIntArgb(StockBrushes.pressurePen(), ink, pen, EPSILON) }
    val renderer = remember { CanvasStrokeRenderer.create() }
    val strokes = remember(lines, brush) { lines.mapNotNull { strokeOf(it, brush) } }
    val identity = remember { Matrix() }
    Box(modifier.semantics { contentDescription = said }) {
        Canvas(Modifier.fillMaxSize()) {
            drawIntoCanvas { canvas -> strokes.forEach { renderer.draw(canvas.nativeCanvas, it, identity) } }
        }
        InProgressStrokes(defaultBrush = brush, onStrokesFinished = { finished -> onWrite(finished.map(::lineOf)) })
    }
}

/** A stroke as kept: its size and its inputs, encoded. */
private fun lineOf(stroke: Stroke): InkLine = InkLine(stroke.brush.size, Base64.getEncoder().encodeToString(stroke.inputs.encode()))

/** A kept stroke drawn again with the page's pen at its own size; none
 *  where it no longer reads. */
private fun strokeOf(line: InkLine, brush: Brush): Stroke? = runCatching {
    val inputs = StrokeInputBatch.decode(Base64.getDecoder().decode(line.inputs))
    Stroke(brush.copy(size = line.size), inputs)
}.getOrNull()

/** The pen's width, and how closely Ink follows the pen (its epsilon, in
 *  the same pixels; a tenth of a pixel, Ink's own samples' figure). */
private val PEN = 2.dp
private const val EPSILON = 0.1f
