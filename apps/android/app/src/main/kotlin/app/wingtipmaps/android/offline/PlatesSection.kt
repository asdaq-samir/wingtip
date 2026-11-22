package app.wingtipmaps.android.offline

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PlateStateSet
import app.wingtipmaps.android.api.generated.PlateStates
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.SectionTitle

/** What the Plates section shows, from DownloadsModel. */
internal class PlatesView(
    val states: PlateStates?,
    val failed: Boolean,
    val kept: List<KeptState>,
    /** The charts done of each state being fetched now, by its id. */
    val running: Map<String, Int>,
    val search: String,
    val onAsk: (PlateStateSet) -> Unit,
    val onRetry: (KeptState) -> Unit,
    val onDelete: (KeptState) -> Unit,
)

/**
 * Downloads' Plates: the FAA's plates kept a state at a time (StatePlates),
 * as the web's Settings → Plates. The states kept first, each with its
 * cycle, how many of its charts are done, what failed, Try Again and
 * Delete; then the states the planner offers, by the screen's search,
 * each with its size, about, a tap asking before it is fetched
 * (ConfirmStatePlates); and under them the cycle and when it ends.
 */
internal fun LazyListScope.platesSection(view: PlatesView) {
    item(key = "plates-title") {
        SectionTitle(stringResource(R.string.plates_section))
        if (view.failed) ProblemLine(stringResource(R.string.plates_unlisted))
    }
    items(view.kept, key = { "plates-kept/${it.id}" }) { k -> KeptStateRow(k, view.running[k.id], view.onRetry, view.onDelete) }
    val kept = view.kept.map { it.id }.toSet()
    val offered = view.states?.states.orEmpty().filter { it.id !in kept && (view.search.isBlank() || it.name.contains(view.search, ignoreCase = true)) }
    items(offered, key = { "plates/${it.id}" }) { set ->
        ListItem(
            onClick = { view.onAsk(set) },
            trailingContent = { Text(stringResource(R.string.plates_about_mb, FlightPlatesLine.aboutMb(set.bytes)), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth(),
            content = { Text(set.name) },
        )
    }
    val states = view.states
    val cycle = states?.cycle
    if (states != null && cycle != null) {
        item(key = "plates-cycle") {
            Text(
                stringResource(R.string.plates_cycle_until, cycle, StatePlates.until(states.nextAt)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(vertical = WingtipSpace.Sm),
            )
        }
    }
}

@Composable
private fun KeptStateRow(kept: KeptState, running: Int?, onRetry: (KeptState) -> Unit, onDelete: (KeptState) -> Unit) {
    // A fetch under way says its own count; else the record's.
    val done = maxOf(running ?: 0, kept.done).coerceAtMost(kept.charts)
    Column(Modifier.fillMaxWidth().padding(vertical = WingtipSpace.Sm)) {
        ListItem(
            trailingContent = { Text(stringResource(R.string.plates_about_mb, FlightPlatesLine.aboutMb(kept.bytes)), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            supportingContent = {
                Text(stringResource(R.string.plates_kept_line, kept.cycle, done, pluralStringResource(R.plurals.plates_charts, kept.charts, kept.charts)))
            },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            content = { Text(kept.name) },
        )
        if (running != null || kept.unfinished) {
            LinearProgressIndicator(progress = { if (kept.charts <= 0) 0f else done.toFloat() / kept.charts }, modifier = Modifier.fillMaxWidth())
        }
        if (kept.unlisted) ProblemLine(stringResource(R.string.plates_unlisted))
        if (kept.failed > 0) ProblemLine(pluralStringResource(R.plurals.plates_failed, kept.failed, kept.failed))
        if (running == null && (kept.unlisted || kept.failed > 0 || kept.unfinished)) {
            TextButton(onClick = { onRetry(kept) }) { Text(stringResource(R.string.offline_try_again)) }
        }
        TextButton(onClick = { onDelete(kept) }) { Text(stringResource(R.string.offline_delete)) }
    }
}

/** The stock alert before a state's plates are fetched: "Download
 *  California's plates?", its charts, fields, size and cycle. */
@Composable
internal fun ConfirmStatePlates(set: PlateStateSet, cycle: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.plates_download_named, set.name)) },
        text = {
            Text(
                stringResource(
                    R.string.plates_download_what,
                    pluralStringResource(R.plurals.plates_charts, set.charts, set.charts),
                    pluralStringResource(R.plurals.plates_fields, set.fields, set.fields),
                    FlightPlatesLine.aboutMb(set.bytes),
                    cycle,
                ),
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onConfirm()
                onDismiss()
            }) { Text(stringResource(R.string.plates_download)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.close)) } },
    )
}
