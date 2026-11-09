package app.wingtipmaps.android.receiver

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.LocalWingtipPalette
import java.time.Instant

/** The receiver's chip on the map: "Stratux · 12 targets · GPS", while
 *  one has been heard; in the caution colour once it has gone quiet. */
@Composable
fun ReceiverChip(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val receiver = remember { Receiver.of(context) }
    val mode by receiver.mode.collectAsStateWithLifecycle()
    val picture by receiver.picture.collectAsStateWithLifecycle()
    val state = picture?.receiver ?: return
    if (mode != ReceiverMode.AUTO || state.heartbeatAt == null) return
    val description = stringResource(R.string.receiver_chip, state.summary)
    Surface(
        shape = CircleShape,
        tonalElevation = 3.dp,
        contentColor = if (state.live) MaterialTheme.colorScheme.onSurface else LocalWingtipPalette.current.caution,
        modifier = modifier.semantics { contentDescription = description },
    ) {
        Text(state.summary, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = WingtipSpace.Sm, vertical = 2.dp))
    }
}

/** The setting, in Setup's Map section: listen for a receiver on the
 *  cockpit's Wi-Fi (Auto), or not; a segmented control, as a discrete
 *  setting is (docs/decisions/0017). */
@Composable
fun ReceiverSettingRows() {
    val context = LocalContext.current
    val receiver = remember { Receiver.of(context) }
    val mode by receiver.mode.collectAsStateWithLifecycle()
    val picture by receiver.picture.collectAsStateWithLifecycle()
    val problem by receiver.problem.collectAsStateWithLifecycle()
    Column(Modifier.padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.receiver_setting), style = MaterialTheme.typography.bodyLarge)
        }
        val choices = listOf(ReceiverMode.AUTO to stringResource(R.string.receiver_auto), ReceiverMode.OFF to stringResource(R.string.receiver_off))
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            choices.forEachIndexed { i, (value, label) ->
                SegmentedButton(
                    selected = mode == value,
                    onClick = { receiver.setMode(value) },
                    shape = SegmentedButtonDefaults.itemShape(index = i, count = choices.size),
                ) { Text(label, maxLines = 1) }
            }
        }
        picture?.receiver?.takeIf { mode == ReceiverMode.AUTO && it.heartbeatAt != null }?.let {
            Text(it.summary, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        problem?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = LocalWingtipPalette.current.caution) }
    }
}

/** A field's METAR and TAF as FIS-B sent them, with when each was heard,
 *  for the airport card with no report from the weather service; else
 *  `otherwise`. */
@Composable
fun ReceiverReports(ident: String, otherwise: @Composable () -> Unit) {
    val context = LocalContext.current
    val receiver = remember { Receiver.of(context) }
    // Read again with each picture, so a report heard while open shows.
    val picture by receiver.picture.collectAsStateWithLifecycle()
    val reports = remember(picture, ident) { receiver.reports(ident) }
    if (reports?.metar == null && reports?.taf == null) {
        otherwise()
        return
    }
    reports.metar?.let { Report(it) }
    reports.taf?.let { Report(it) }
}

@Composable
private fun Report(report: EngineContract.ReceiverReport) {
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        val heard = Format.zulu(Instant.ofEpochMilli((report.at * 1000).toLong()))
        Text(stringResource(R.string.receiver_report, report.kind, heard), style = MaterialTheme.typography.labelLarge)
        // The report as sent, never reworded.
        Text(report.text, style = MaterialTheme.typography.bodyMedium)
    }
}
