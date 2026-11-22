package app.wingtipmaps.android.receiver

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.MaterialTheme
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.FlightSession
import app.wingtipmaps.android.flight.OwnShipSource
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
    val weighed by remember { FlightSession.from(context).ownShip }.weighed.collectAsStateWithLifecycle()
    val nexrad by receiver.nexrad.collectAsStateWithLifecycle()
    val state = picture?.receiver ?: return
    if (!Receiver.ENABLED || mode != ReceiverMode.AUTO || state.heartbeatAt == null) return
    // Whose position own ship is, and how old the receiver's NEXRAD is,
    // after the summary: what on the map came from the receiver, and when.
    val line = listOfNotNull(state.summary, positionWords(weighed, state.name), radarWords(nexrad)).joinToString(" · ")
    val description = stringResource(R.string.receiver_chip, line)
    // Material's badge with text, in the theme's raised container.
    Badge(
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = if (state.live) MaterialTheme.colorScheme.onSurface else LocalWingtipPalette.current.caution,
        modifier = modifier.semantics { contentDescription = description },
    ) {
        Text(line)
    }
}

/** Whose position own ship is when it is the receiver's, or why the
 *  receiver's is not used (the engine's receiver_position). */
@Composable
fun positionWords(weighed: OwnShipSource.Weighed?, name: String?): String? {
    val who = name ?: stringResource(R.string.receiver_unnamed)
    return when {
        weighed == null -> null
        weighed.kind == OwnShipSource.Kind.RECEIVER -> stringResource(R.string.receiver_position_from, who)
        weighed.receiver == "no_gps" -> stringResource(R.string.receiver_no_gps, who)
        weighed.receiver == "weak" -> stringResource(R.string.receiver_gps_weak, who)
        else -> null
    }
}

/** "Radar from receiver 4 min": the newest NEXRAD block's age; none drawn, none. */
@Composable
private fun radarWords(nexrad: EngineContract.ReceiverNexradAnswer?, nowMs: Long = AppClock.nowMs()): String? {
    val at = nexrad?.at ?: return null
    if (nexrad.levels.none { it.rects.isNotEmpty() }) return null
    return stringResource(R.string.receiver_radar_age, ((nowMs / 1000.0 - at) / 60).toInt().coerceAtLeast(0))
}

/** "Heard by Stratux 3 s ago" for an airplane the cockpit's receiver hears,
 *  not the internet's; none where it does not. */
@Composable
fun ReceiverHeard(hex: String, modifier: Modifier = Modifier, nowMs: Long = AppClock.nowMs()) {
    val context = LocalContext.current
    val picture by remember { Receiver.of(context) }.picture.collectAsStateWithLifecycle()
    val target = picture?.targets?.firstOrNull { it.hex == hex.lowercase() } ?: return
    val name = picture?.receiver?.name ?: stringResource(R.string.receiver_unnamed)
    val ago = (nowMs / 1000.0 - target.at).toInt().coerceAtLeast(0)
    Text(
        stringResource(R.string.receiver_heard_by, name, ago), style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier,
    )
}

/** The Brief's reports from the cockpit's receiver: each of the route's
 *  fields' METAR and TAF that FIS-B sent, as sent, with when each was
 *  heard. FIS-B is not the only source of weather (AIM 4-5-9). */
@Composable
fun ReceiverBriefReports(idents: List<String>) {
    if (!Receiver.ENABLED) return
    val context = LocalContext.current
    val receiver = remember { Receiver.of(context) }
    val picture by receiver.picture.collectAsStateWithLifecycle()
    val heard = remember(picture, idents) { idents.mapNotNull { receiver.reports(it) }.filter { it.metar != null || it.taf != null } }
    if (heard.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Text(stringResource(R.string.receiver_brief), style = MaterialTheme.typography.titleMedium)
        heard.forEach { reports ->
            reports.metar?.let { Report(it) }
            reports.taf?.let { Report(it) }
        }
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
    val weighed by remember { FlightSession.from(context).ownShip }.weighed.collectAsStateWithLifecycle()
    if (!Receiver.ENABLED) return
    Column(Modifier.padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.receiver_setting), style = MaterialTheme.typography.bodyLarge)
        }
        val choices = listOf(ReceiverMode.AUTO to stringResource(R.string.receiver_auto), ReceiverMode.OFF to stringResource(R.string.receiver_off))
        ChoiceGroup(choices, selected = mode, onPick = receiver::setMode)
        picture?.receiver?.takeIf { mode == ReceiverMode.AUTO && it.heartbeatAt != null }?.let {
            Text(it.summary, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val name = it.name ?: stringResource(R.string.receiver_unnamed)
            val from = if (weighed?.kind == OwnShipSource.Kind.RECEIVER) {
                stringResource(R.string.receiver_position_from, name)
            } else {
                stringResource(R.string.receiver_position, stringResource(R.string.receiver_position_device))
            }
            Text(from, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
