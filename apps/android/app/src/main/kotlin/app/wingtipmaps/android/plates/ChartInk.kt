package app.wingtipmaps.android.plates

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.EditOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.library.Mark
import app.wingtipmaps.android.library.MarkupBar
import app.wingtipmaps.android.library.MarkupStore
import app.wingtipmaps.android.library.Marking
import app.wingtipmaps.android.library.PageInk
import app.wingtipmaps.android.library.Pen

/**
 * A full-screen chart's Markup, as the documents reader's is: Markup in
 * the viewer's bar turns the pen on, the page holds still for it, and the
 * reader's own bar at the foot picks the pen or the highlighter, takes
 * back the last mark, clears the page, or is Done. Kept by the chart and
 * its cycle (PlateInk). The iPad's chart viewer has the same, PencilKit's.
 */
class ChartInk internal constructor(private val store: MarkupStore, penState: MutableState<Pen?>) {
    /** The pen or the highlighter while marking; null while reading. */
    var pen by penState

    fun add(marks: List<Mark>) = store.add(marks)

    fun undo() = store.undo(PAGE)

    fun clear() = store.clear(PAGE)

    internal val marks get() = store.marks

    private companion object {
        /** A chart is one page. */
        const val PAGE = 1
    }
}

/** The chart at `url`'s ink, the pen kept through a resize or a turn. */
@Composable
fun rememberChartInk(url: String): ChartInk {
    val context = LocalContext.current
    val pen = rememberSaveable(url) { mutableStateOf<Pen?>(null) }
    return remember(url) { ChartInk(PlateInk.of(context, url), pen) }
}

/** What the page draws: the marks and the pen now. */
@Composable
fun ChartInk.pageInk(): PageInk {
    val shown by marks.collectAsStateWithLifecycle()
    return PageInk(shown, Marking.of(pen, LocalDensity.current), this::add)
}

/** Markup, in the viewer's bar: on, or Done with it. */
@Composable
fun ChartInkButton(ink: ChartInk) {
    val on = ink.pen != null
    IconButton(onClick = { ink.pen = if (on) null else Pen.INK }) {
        Icon(if (on) Icons.Filled.EditOff else Icons.Filled.Draw, contentDescription = stringResource(if (on) R.string.done else R.string.reader_markup))
    }
}

/** The reader's Markup bar at the chart's foot while marking. */
@Composable
fun ChartInkBar(ink: ChartInk) {
    val pen = ink.pen ?: return
    MarkupBar(pen, onPen = { ink.pen = it }, onUndo = ink::undo, onClear = ink::clear, onDone = { ink.pen = null })
}
