package app.wingtipmaps.android.library

import android.graphics.RectF
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.ZoomableState
import me.saket.telephoto.zoomable.rememberZoomableState

/** The pager the reader turns and each page's zoom, for the keyboard's
 *  keys and the contents' picks. */
class PdfControl(val pager: PagerState) {
    internal val zooms = mutableStateMapOf<Int, ZoomableState>()

    /** The page shown, from 1. */
    val page: Int get() = pager.currentPage + 1

    suspend fun go(page: Int) = pager.animateScrollToPage((page - 1).coerceIn(0, (pager.pageCount - 1).coerceAtLeast(0)))

    suspend fun turn(by: Int) = go(page + by)

    /** The page shown zoomed in or out by `factor` about its middle. */
    suspend fun zoom(factor: Float) {
        zooms[pager.currentPage]?.zoomBy(factor, Offset.Unspecified)
    }

    suspend fun fit() {
        zooms[pager.currentPage]?.resetZoom()
    }
}

@Composable
fun rememberPdfControl(start: Int, count: Int): PdfControl {
    val pager = rememberPagerState(initialPage = (start - 1).coerceIn(0, (count - 1).coerceAtLeast(0))) { count }
    return remember(pager) { PdfControl(pager) }
}

/**
 * A PDF's pages one at a time, turned by a swipe, the arrow keys or the
 * contents, as Android's own viewers turn a document (Compose's
 * HorizontalPager, which telephoto's zoomable pans within until a page's
 * edge). The page left at is kept as the pages turn (ReaderMemory); a
 * match picked turns to its page, and the page shown marks the search's
 * matches where the platform finds them.
 */
@Composable
internal fun PdfBody(
    pages: PdfPages,
    model: ReaderModel,
    control: PdfControl,
    inverted: Boolean,
    marking: Marking,
    onNote: (Mark) -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    val marks by model.markup.marks.collectAsStateWithLifecycle()
    LaunchedEffect(control) {
        snapshotFlow { control.page }.collect { model.memory.leftAtPage(model.place.doc, it) }
    }
    val wanted = state.hits.getOrNull(state.hit)?.page
    LaunchedEffect(wanted) { if (wanted != null) control.go(wanted) }
    HorizontalPager(
        state = control.pager,
        modifier = Modifier.testTag("reader-pages"),
        beyondViewportPageCount = 0,
        // A page held still for the ink does not turn under the pen.
        userScrollEnabled = marking.pen == null,
        key = { it },
    ) { index ->
        val zoom = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 8f))
        LaunchedEffect(zoom) { control.zooms[index] = zoom }
        val matches by produceState(emptyList<RectF>(), index, state.query, state.hits) {
            value = if (state.hits.any { it.page == index + 1 }) pages.matches(index, state.query) else emptyList()
        }
        PdfPageView(
            pages = pages,
            index = index,
            inverted = inverted,
            matches = matches,
            marks = marks.filter { it.page == index + 1 },
            marking = marking,
            zoom = zoom,
            onMarked = { model.marked(it) },
            onNote = onNote,
        )
    }
}
