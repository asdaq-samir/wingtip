package app.wingtipmaps.android.library

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Density
import androidx.ink.authoring.compose.InProgressStrokes
import androidx.ink.rendering.android.canvas.CanvasStrokeRenderer
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace

/** How a page is marked now: not at all (reading, the page zooms), or
 *  with the pen or the highlighter (the page holds still for the ink). */
data class Marking(val pen: Pen?, val color: Int, val size: Float) {
    companion object {
        /** The pen's ink, the map's blue and fine, or the highlighter's,
         *  taxiway yellow, wide and see-through over the page's words. */
        fun of(pen: Pen?, density: Density): Marking = Marking(
            pen,
            (if (pen == Pen.HIGHLIGHT) WingtipColors.Brand.TaxiwayYellow.copy(alpha = HIGHLIGHT_ALPHA) else WingtipColors.Chart.MapBlue).toArgb(),
            with(density) { (if (pen == Pen.HIGHLIGHT) WingtipSpace.Lg else WingtipSpace.Xs).toPx() },
        )

        private const val HIGHLIGHT_ALPHA = 0.4f
    }
}

/** A one-page chart's ink as its viewer hands it to the page
 *  (ui/ZoomablePage): the marks, how it is marked now, and where a
 *  finished stroke goes. */
class PageInk(val marks: List<Mark>, val marking: Marking, val onMarked: (List<Mark>) -> Unit)

/**
 * The pilot's marks over a page, a document's (PdfPageView) or a chart's
 * (the plate viewer, plates/PlateInk), each drawn by Jetpack Ink's Canvas
 * renderer at the page's width now over its width when drawn, so it keeps
 * to its place at any size; and, while marking, Ink's InProgressStrokes
 * taking a stylus's or a finger's strokes with low latency, each finished
 * stroke handed on as a Mark on `page` (from 1).
 */
@Composable
internal fun MarkLayer(marks: List<Mark>, page: Int, wPx: Float, hPx: Float, marking: Marking, onMarked: (List<Mark>) -> Unit) {
    val renderer = remember { CanvasStrokeRenderer.create() }
    val strokes = remember(marks) { marks.filter { it.page == page }.mapNotNull { m -> m.stroke()?.let { it to m.width } } }
    Canvas(Modifier.fillMaxSize()) {
        drawIntoCanvas { canvas ->
            for ((stroke, width) in strokes) {
                val scale = wPx / width.coerceAtLeast(1f)
                renderer.draw(canvas.nativeCanvas, stroke, android.graphics.Matrix().apply { setScale(scale, scale) })
            }
        }
    }
    val pen = marking.pen ?: return
    val brush = remember(marking) { Mark.brush(pen, marking.color, marking.size) }
    InProgressStrokes(defaultBrush = brush) { finished ->
        onMarked(finished.map { Mark.of(page, pen, it, wPx, hPx) })
    }
}
