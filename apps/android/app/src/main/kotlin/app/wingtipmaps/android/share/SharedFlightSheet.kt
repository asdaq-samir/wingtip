package app.wingtipmaps.android.share

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.gateway.FlightCheckpointDto
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/**
 * A flight another pilot sent, previewed (SharedFlightModel): its route,
 * altitude, departure time, airplane type and flight rules, and a saved
 * flight's filed nav log, with Use This Plan and Not Now. Nothing of the
 * receiver's plan changes until Use This Plan.
 */
@Composable
fun SharedFlightHost(model: SharedFlightModel, plan: Plan) {
    val state by model.state.collectAsStateWithLifecycle()
    if (state == SharedFlightModel.State.Closed) return
    WingtipSheet(title = stringResource(R.string.shared_flight), onClose = model::close, full = true) {
        Column(Modifier.padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            when (val s = state) {
                SharedFlightModel.State.Closed -> {}
                SharedFlightModel.State.Reading -> Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
                    Loading(Modifier)
                    Text(stringResource(R.string.shared_reading))
                }
                SharedFlightModel.State.Gone -> Gone(model::close)
                is SharedFlightModel.State.Problem -> {
                    ProblemLine(s.words)
                    TextButton(onClick = model::close) { Text(stringResource(R.string.close)) }
                }
                is SharedFlightModel.State.Shown -> Shown(s, onUse = { model.use(plan) }, onNotNow = model::close)
            }
        }
    }
}

@Composable
private fun Gone(onClose: () -> Unit) {
    Text(stringResource(R.string.shared_gone), style = MaterialTheme.typography.bodyLarge)
    TextButton(onClick = onClose, modifier = Modifier.padding(bottom = WingtipSpace.Xl)) { Text(stringResource(R.string.close)) }
}

@Composable
private fun Shown(s: SharedFlightModel.State.Shown, onUse: () -> Unit, onNotNow: () -> Unit) {
    val p = s.plan
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Button(onClick = onUse) { Text(stringResource(R.string.shared_use)) }
        TextButton(onClick = onNotNow) { Text(stringResource(R.string.not_now)) }
    }
    LazyColumn(Modifier.fillMaxWidth()) {
        item { Fact(R.string.shared_route, (listOf(p.dep) + p.stops + p.dest).joinToString(" → ")) }
        item { Fact(R.string.shared_altitude, p.altitudeFt?.let { Format.cruiseAltitude(it.toDouble()) } ?: Format.NONE) }
        item {
            val departs = p.depart?.let { runCatching { Format.zulu(it) }.getOrNull() } ?: stringResource(R.string.shared_departs_now)
            Fact(R.string.shared_departs, departs)
        }
        // The type is the sender's, told; the receiver's own airplane flies it.
        p.type?.let { item { Fact(R.string.shared_airplane, it, stringResource(R.string.shared_airplane_note)) } }
        p.rules?.let { item { Fact(R.string.shared_rules, it.uppercase()) } }
        p.tail?.let { item { Fact(R.string.shared_tail, it) } }
        s.totals?.let { t ->
            item {
                Fact(
                    R.string.shared_nav_log,
                    stringResource(R.string.shared_totals, Format.distance(t.distanceNm), t.eteMin?.let(Format::duration) ?: Format.NONE, Format.fuel(t.fuelGal)),
                )
            }
        }
        items(s.navLog, key = { it.sequenceNo }) { cp ->
            NavLogRow(cp)
            HorizontalDivider()
        }
    }
}

@Composable
private fun Fact(title: Int, value: String, note: String? = null) {
    ListItem(
        overlineContent = { Text(stringResource(title)) },
        supportingContent = note?.let { { Text(it) } },
        content = { Text(value) },
    )
}

/** One filed nav log line: where, and the leg's heading, groundspeed,
 *  time and fuel as the sender's planner worked them out. */
@Composable
private fun NavLogRow(cp: FlightCheckpointDto) {
    val figures = listOfNotNull(
        cp.magneticHeadingDeg?.let { "MH " + Format.heading(it) },
        cp.groundspeedKt?.let(Format::speed),
        cp.eteMin?.let(Format::navLogTime),
        cp.fuelGal?.let(Format::fuel),
    ).joinToString(" · ")
    ListItem(
        supportingContent = if (figures.isEmpty()) null else { { Text(figures) } },
        content = { Text(cp.name) },
    )
}
