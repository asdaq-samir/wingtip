package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.StopTimes
import java.time.ZoneId

/**
 * The route's timeline look, the web's FPL (the owner, 2026-11-19 to 20):
 * one solid line in the course's magenta, the map's own route colour,
 * joining the points down the list, each field's mark on it a dot in its
 * flight category's colour (VFR green, MVFR blue, IFR red, LIFR magenta,
 * grey unknown: FlightCategory), the line going on through the gaps of
 * Material's segmented list. A row's line is drawn over its own surface
 * at its leading mark's centre, found where the mark is laid out, so it
 * meets the next row's whatever the list item's padding.
 */
@Stable
class TimelineThread {
    var rowLeft by mutableFloatStateOf(0f)
    var markX by mutableFloatStateOf(Float.NaN)
}

/** The row's piece of the line: from the row above (none on the first)
 *  to the row below (none on the last), broken round its mark, and the
 *  mark's dot where it has one. */
fun Modifier.timelineThread(thread: TimelineThread, first: Boolean, last: Boolean, dot: Color?, gap: Dp): Modifier = this
    .onGloballyPositioned { thread.rowLeft = it.positionInRoot().x }
    .drawWithContent {
        drawContent()
        if (thread.markX.isNaN()) return@drawWithContent
        val x = thread.markX - thread.rowLeft
        val centre = size.height / 2
        val clear = (if (dot != null) DOT else CLEAR).toPx()
        val width = WingtipSpace.Xxs.toPx()
        if (!first) drawLine(WingtipColors.Chart.Course, Offset(x, -gap.toPx()), Offset(x, centre - clear), width)
        if (!last) drawLine(WingtipColors.Chart.Course, Offset(x, centre + clear), Offset(x, size.height + gap.toPx()), width)
        dot?.let {
            // Cased, so a red dot keeps its edge on the night's card (FlightCategory.RING).
            drawCircle(FlightCategory.RING, DOT.toPx(), Offset(x, centre))
            drawCircle(it, DOT.toPx() - FlightCategory.RING_WIDTH.toPx(), Offset(x, centre))
        }
    }

/** The leading mark's room, where the line's x is read from. */
@Composable
fun TimelineMark(thread: TimelineThread, content: @Composable () -> Unit = {}) {
    Box(
        Modifier.size(WingtipSpace.Xl).onGloballyPositioned { thread.markX = it.boundsInRoot().center.x },
        contentAlignment = Alignment.Center,
    ) { content() }
}

/**
 * A point's times at its line's end (the web's 5d511a375, f49fb4da2,
 * 92ed734d3): when it lands, and at a stop when it leaves again, a tap
 * that sets it in Material's time picker (the planner's `ground` for the
 * stop: the minutes on the ground from landing); its zone said once the
 * route crosses one (StopTimes).
 */
@Composable
fun PointTimes(at: StopTimes.At?, zone: ZoneId?, zonesSaid: Boolean, left: StopTimes.Left, onLeave: ((Int, Int) -> Unit)?) {
    at ?: return
    var asking by rememberSaveable { mutableStateOf(false) }
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(horizontalAlignment = Alignment.End) {
        at.arriveMs?.let { Text(StopTimes.words(it, zone, zonesSaid, left = left), style = MaterialTheme.typography.bodyMedium, color = muted) }
        val leave = at.leaveMs
        if (leave != null && onLeave != null) {
            TextButton(onClick = { asking = true }) { Text(stringResource(R.string.leaves_at, StopTimes.words(leave, zone, zonesSaid, left = left))) }
        } else if (leave != null && at.arriveMs == null) {
            Text(StopTimes.words(leave, zone, zonesSaid, left = left), style = MaterialTheme.typography.bodyMedium, color = muted)
        }
    }
    val leave = at.leaveMs
    if (asking && leave != null && onLeave != null) {
        val shown = java.time.Instant.ofEpochMilli(leave).atZone(ZoneId.systemDefault())
        TimeDialog(
            title = stringResource(R.string.leaves_title),
            hour = shown.hour,
            minute = shown.minute,
            onSet = { h, m ->
                asking = false
                onLeave(h, m)
            },
            onDismiss = { asking = false },
        )
    }
}

/** The row's end: its times, then its menu. */
@Composable
fun PointEnd(times: @Composable () -> Unit, menu: @Composable () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        times()
        menu()
    }
}

/** A field's mark's colour: its flight category's, grey where unknown. */
fun markColour(category: String?): Color = FlightCategory.mark(category)

/** Round a point's dot, and round the Add a Stop row's glyph, the line breaks. */
private val DOT = WingtipSpace.Xs + WingtipSpace.Xxs
private val CLEAR = WingtipSpace.Md

/** Kept for the rows that make their own thread. */
@Composable
fun rememberThread(): TimelineThread = remember { TimelineThread() }
