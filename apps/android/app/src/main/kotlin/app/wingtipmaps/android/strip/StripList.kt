package app.wingtipmaps.android.strip

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.route.LegWords
import app.wingtipmaps.android.ui.InkColors
import app.wingtipmaps.android.ui.LocalInk
import app.wingtipmaps.android.ui.largeType

/** More checkpoints than this fold in the middle, the first and the last
 *  kept (the canvas's "N more checkpoints"). */
private const val SHOWN = 6
private const val FIRST = 3
private const val LAST = 2

/** The timeline's column at the left: the magenta line, and the entry's
 *  dot on it, a field's larger and green, a checkpoint's brown. */
@Composable
private fun Timeline(field: Boolean, first: Boolean, last: Boolean, dotAt: androidx.compose.ui.unit.Dp) {
    val ink = LocalInk.current
    val dot = pointColour(field)
    Canvas(Modifier.width(24.dp).fillMaxHeight()) {
        val x = 9.dp.toPx()
        val y = dotAt.toPx()
        val top = if (first) y else 0f
        val bottom = if (last) y else size.height
        drawLine(ink.magenta, Offset(x, top), Offset(x, bottom), strokeWidth = 4.dp.toPx())
        drawCircle(dot, radius = (if (field) 9.dp else 7.dp).toPx(), center = Offset(x, y))
    }
}

/** A field's card on the line: its ident and name, the time there, the
 *  runway and wind where the glance has them, its chips. The ident is
 *  the way into its card. */
@Composable
private fun FieldCardRow(
    ident: String,
    card: StripModel.FieldCard?,
    at: String?,
    atLabel: String,
    detail: List<String?>,
    first: Boolean,
    last: Boolean,
    onOpen: () -> Unit,
    onClearance: (() -> Unit)? = null,
) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).height(IntrinsicSize.Min).padding(end = WingtipSpace.Lg)) {
        Box(Modifier.width(24.dp).fillMaxHeight()) { Timeline(field = true, first = first, last = last, dotAt = 24.dp) }
        StripCard(onClick = onOpen, modifier = Modifier.weight(1f)) {
            Column(Modifier.padding(WingtipSpace.Md), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                Row(verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(ident, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                        val name = card?.name.orEmpty()
                        if (name.isNotEmpty()) {
                            Text(
                                name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = if (largeType()) 3 else 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    if (at != null) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(at, style = MaterialTheme.typography.titleMedium)
                            Text(atLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                val said = detail.filterNotNull().filter { it.isNotEmpty() }
                if (said.isNotEmpty()) {
                    Text(said.joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
                }
                val chips = card?.chips.orEmpty()
                if (chips.isNotEmpty() || onClearance != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                        chips.forEach { chip ->
                            AssistChip(
                                onClick = onOpen,
                                label = { Text(chip.label, style = MaterialTheme.typography.labelMedium) },
                                modifier = Modifier.semantics { contentDescription = chip.words },
                            )
                        }
                        // The departure's clearance step, as the iPhone's strip has it.
                        if (onClearance != null) {
                            AssistChip(
                                onClick = onClearance,
                                label = { Text(stringResource(R.string.clearance), style = MaterialTheme.typography.labelMedium) },
                                modifier = Modifier.semantics { contentDescription = "The clearance card" },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** A checkpoint's row: its number and name, "MH 318 · 24 NM" under them,
 *  the leg's minutes at the right. TalkBack reads the row as one sentence
 *  in words (LegWords), the written figures under it cleared. */
@Composable
private fun CheckpointRow(number: Int, name: String, leg: Leg, onOpen: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).height(IntrinsicSize.Min).padding(end = WingtipSpace.Lg)) {
        Box(Modifier.width(24.dp).fillMaxHeight()) { Timeline(field = false, first = false, last = false, dotAt = 24.dp) }
        TextButton(
            onClick = onOpen,
            modifier = Modifier.weight(1f).heightIn(min = 48.dp).semantics { contentDescription = LegWords.checkpoint(number, name, leg) },
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = WingtipSpace.Sm, vertical = WingtipSpace.Xs),
        ) {
            Column(Modifier.weight(1f).clearAndSetSemantics {}) {
                Text(
                    "$number. $name", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface,
                    maxLines = if (largeType()) 3 else 1, overflow = TextOverflow.Ellipsis,
                )
                Text(StripData.legFigures(leg), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            leg.eteMin?.let { Text(Format.duration(it), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.clearAndSetSemantics {}) }
        }
    }
}

/**
 * The strip's timeline, as items of the sheet's list: the departure's
 * card, each checkpoint a row, a stop's card, and the destination's, on
 * one magenta line; the middle folded where there are more than six
 * checkpoints. Every figure is the planner's leg's; the times are from
 * leaving now. `after` is what follows the destination: the debrief,
 * once a track is flown.
 *
 * @param leaveMs when the flight leaves, as the clock's epoch; the times
 *   at each row are this plus the planner's minutes.
 */
fun LazyListScope.stripList(
    rows: List<StripRow>,
    cards: Map<String, StripModel.FieldCard>,
    leaveMs: Long,
    departDetail: List<String?>,
    arriveDetail: List<String?>,
    unfolded: Boolean,
    onUnfold: () -> Unit,
    onField: (String) -> Unit,
    onCheckpoint: (StripRow.Checkpoint) -> Unit,
    onClearance: (() -> Unit)? = null,
    after: (LazyListScope.() -> Unit)? = null,
) {
    val first = rows.firstOrNull() as? StripRow.Departure ?: return
    val middle = rows.drop(1).dropLast(1)
    val checkpoints = middle.count { it is StripRow.Checkpoint }
    val folded = !unfolded && checkpoints > SHOWN
    val shown: List<StripRow?> = if (folded) middle.take(FIRST) + listOf(null) + middle.takeLast(LAST) else middle
    val hidden = if (folded) middle.size - FIRST - LAST else 0
    val last = rows.lastOrNull() as? StripRow.Destination

    item(key = first.key) {
        FieldCardRow(
            ident = first.ident, card = cards[first.ident], at = StripData.timeAt(leaveMs, 0.0), atLabel = "leaving",
            detail = departDetail, first = true, last = false, onOpen = { onField(first.ident) }, onClearance = onClearance,
        )
    }
    shown.forEach { row ->
        when (row) {
            null -> item(key = "fold") {
                Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).height(IntrinsicSize.Min).padding(end = WingtipSpace.Lg)) {
                    Box(Modifier.width(24.dp).fillMaxHeight()) { Timeline(field = false, first = false, last = false, dotAt = 24.dp) }
                    TextButton(onClick = onUnfold, modifier = Modifier.weight(1f)) {
                        Text("$hidden more checkpoints", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            is StripRow.Stop -> item(key = row.key) {
                FieldCardRow(
                    ident = row.ident, card = cards[row.ident], at = StripData.timeAt(leaveMs, row.minutesFlown), atLabel = "ETA",
                    detail = listOf(row.groundMin?.takeIf { it > 0 }?.let { "${Format.duration(it)} on the ground" }),
                    first = false, last = false, onOpen = { onField(row.ident) },
                )
            }
            is StripRow.Checkpoint -> item(key = row.key) {
                CheckpointRow(row.number, row.name, row.leg, onOpen = { onCheckpoint(row) })
            }
            else -> {}
        }
    }
    if (last != null) {
        item(key = last.key) {
            FieldCardRow(
                ident = last.ident, card = cards[last.ident], at = StripData.timeAt(leaveMs, last.minutesFlown), atLabel = "ETA",
                detail = arriveDetail, first = false, last = true, onOpen = { onField(last.ident) },
            )
        }
    }
    after?.invoke(this)
}

/** The first flight's welcome, with no route: the field below is the
 *  way in. */
@Composable
fun StripWelcome(modifier: Modifier = Modifier) {
    StripCard(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
                Icon(
                    Icons.Filled.Flight, contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp),
                )
                Text(stringResource(R.string.where_to), style = MaterialTheme.typography.titleLarge)
            }
            Text(
                "Type or say a field, a town or a route below. Wingtip plans from where you are: the route, the checkpoints you'll see from the air, the nav log and a weather brief, all on one strip.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
