package app.wingtipmaps.android.library

import android.graphics.Bitmap
import android.graphics.RectF
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.StickyNote2
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.Loading
import me.saket.telephoto.zoomable.ZoomableState
import me.saket.telephoto.zoomable.zoomable
import kotlin.math.roundToInt

/**
 * One page of a PDF, fitted to the reader and drawn at twice its width on
 * screen for a sharp zoom, inverted for the night where asked (a colour
 * matrix over the page, as Firefox's and ForeFlight's Invert Colors are),
 * pinched, panned and double-tapped with telephoto's zoomable as the
 * plates are. Over it the search's matches, the pilot's marks (Jetpack
 * Ink's own renderer), each note's glyph, and, while marking, Ink's
 * InProgressStrokes taking a stylus's or a finger's strokes with low
 * latency.
 */
@Composable
internal fun PdfPageView(
    pages: PdfPages,
    index: Int,
    inverted: Boolean,
    matches: List<RectF>,
    marks: List<Mark>,
    marking: Marking,
    zoom: ZoomableState,
    onMarked: (List<Mark>) -> Unit,
    onNote: (Mark) -> Unit,
) {
    val size = pages.sizes[index]
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val k = minOf(constraints.maxWidth / size.width.toFloat(), constraints.maxHeight / size.height.toFloat())
        val wPx = size.width * k
        val hPx = size.height * k
        val density = LocalDensity.current
        val drawn by produceState<Bitmap?>(null, pages, index, wPx) {
            value = runCatching { pages.draw(index, (wPx * 2).roundToInt()) }.getOrNull()
        }
        val pen = marking.pen
        val still = pen != null
        val box = Modifier.size(with(density) { wPx.toDp() }, with(density) { hPx.toDp() })
        Box(if (still) box else box.zoomable(zoom)) {
            val page = drawn
            if (page == null) {
                Loading(Modifier.align(Alignment.Center))
            } else {
                val image = remember(page) { page.asImageBitmap() }
                Image(image, contentDescription = stringResource(R.string.reader_page_of, index + 1, pages.count), colorFilter = if (inverted) INVERT else null, modifier = Modifier.fillMaxSize())
            }
            Matches(matches)
            MarkLayer(marks, index + 1, wPx, hPx, marking, onMarked)
            for (m in marks.filter { it.note != null }) {
                IconButton(
                    onClick = { onNote(m) },
                    modifier = Modifier.offset { IntOffset((m.noteX * wPx).roundToInt() - NOTE_PX, (m.noteY * hPx).roundToInt() - NOTE_PX * 2) },
                ) {
                    Icon(Icons.AutoMirrored.Filled.StickyNote2, contentDescription = m.note, tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

/** The search's matches, a wash of the tint over each. */
@Composable
private fun Matches(matches: List<RectF>) {
    if (matches.isEmpty()) return
    val wash = MaterialTheme.colorScheme.primary.copy(alpha = MATCH_ALPHA)
    Canvas(Modifier.fillMaxSize()) {
        for (r in matches) drawRect(wash, Offset(r.left * size.width, r.top * size.height), Size(r.width() * size.width, r.height() * size.height))
    }
}

/** White on black: each colour taken from its full, alpha kept. */
private val INVERT = ColorFilter.colorMatrix(
    ColorMatrix(floatArrayOf(-1f, 0f, 0f, 0f, 255f, 0f, -1f, 0f, 0f, 255f, 0f, 0f, -1f, 0f, 255f, 0f, 0f, 0f, 1f, 0f)),
)

private const val MATCH_ALPHA = 0.3f

/** Half a note glyph's button, so the glyph sits just above its line. */
private const val NOTE_PX = 24
